import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateCompanyProfileDto, UpdateCompanyProfileDto } from './dto/company-profile.dto';

/**
 * Added per explicit product decision (verification-check follow-up, "company/
 * business profile" gap — previously confirmed UNSUPPORTED: no model, no
 * endpoint, no UI existed at all).
 *
 * Scope boundary, stated explicitly rather than left implicit: this is a
 * *profile* — a named, described entity that groups an owner's vehicles for
 * public display, with one owner. It deliberately does NOT implement:
 *   - Multiple staff logins/seats under one company account (still exactly
 *     one User per CompanyProfile, enforced by the unique ownerUserId).
 *   - Business/KYB verification (no equivalent of the individual
 *     VerificationSession/LicenseRecord flow for companies).
 *   - A separate billing/payout entity distinct from the owning User's
 *     existing PaymentMethod records.
 * These were flagged as open questions in the implementation summary rather
 * than guessed at, since each is a distinct design decision this task's
 * source material does not specify.
 */
@Injectable()
export class CompanyProfileService {
  constructor(private prisma: PrismaService) {}

  async createCompanyProfile(userId: string, dto: CreateCompanyProfileDto) {
    const existing = await this.prisma.companyProfile.findUnique({ where: { ownerUserId: userId } });
    if (existing) throw new ConflictException('This account already has a company profile');
    return this.prisma.companyProfile.create({
      data: { ownerUserId: userId, name: dto.name, description: dto.description },
    });
  }

  /**
   * Added alongside the rest of this module: without this, a signed-in owner
   * has no way to find their own company profile's id to manage it (there is
   * no client-side persistence of ids across sessions). Auth-gated (the
   * caller's own profile only, derived from their JWT — not an arbitrary
   * lookup by user id), so it does not add a new way to look up someone
   * else's company profile.
   */
  async getMyCompanyProfile(userId: string) {
    return this.prisma.companyProfile.findUnique({ where: { ownerUserId: userId } });
  }

  /**
   * @Public() on the controller — used by the company-profile hub page, must
   * not leak sensitive data. Uses `select`, not `include`, on the nested
   * vehicle relation for the same reason `getVehiclePublicSummary` does in
   * vehicle-listing.service.ts: `Vehicle` carries `vin`, `ownerId`,
   * `ownershipDocTokenRef`, `ownershipVerificationStatus`, and
   * `telematicsDeviceId`, none of which belong in a public response. Only
   * `active` listings are included, matching what an anonymous visitor could
   * already see individually via `GET /listings/:id`.
   */
  async getCompanyProfile(companyProfileId: string) {
    const company = await this.prisma.companyProfile.findUnique({
      where: { id: companyProfileId },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        vehicles: {
          select: {
            id: true,
            make: true,
            model: true,
            year: true,
            trim: true,
            seats: true,
            transmission: true,
            fuelType: true,
            mileageLimitPerDay: true,
            features: true,
            photos: { orderBy: { position: 'asc' }, select: { id: true, vehicleId: true, url: true, position: true, createdAt: true } },
            listings: {
              where: { status: 'active' },
              select: {
                id: true,
                vehicleId: true,
                ownerId: true,
                basePriceCents: true,
                currency: true,
                description: true,
                locationLat: true,
                locationLng: true,
                locationLabel: true,
                instantBookEnabled: true,
                deliveryOptions: true,
                minimumTrustTier: true,
                status: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });
    if (!company) throw new NotFoundException('Company profile not found');
    return company;
  }

  async updateCompanyProfile(companyProfileId: string, callerId: string, dto: UpdateCompanyProfileDto) {
    const company = await this.prisma.companyProfile.findUnique({ where: { id: companyProfileId } });
    if (!company) throw new NotFoundException('Company profile not found');
    if (company.ownerUserId !== callerId) throw new ForbiddenException('Only the company profile owner may update it');
    return this.prisma.companyProfile.update({ where: { id: companyProfileId }, data: dto });
  }

  async assignVehicle(companyProfileId: string, callerId: string, vehicleId: string) {
    const company = await this.prisma.companyProfile.findUnique({ where: { id: companyProfileId } });
    if (!company) throw new NotFoundException('Company profile not found');
    if (company.ownerUserId !== callerId) throw new ForbiddenException('Only the company profile owner may assign vehicles to it');

    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    // A vehicle can only be assigned to a company profile by the same individual
    // who owns both the vehicle (Vehicle.ownerId) and the company profile — this
    // mirrors every other ownership check in vehicle-listing.service.ts and does
    // not introduce a new authorization model.
    if (vehicle.ownerId !== callerId) throw new ForbiddenException('Only the vehicle owner may assign it to a company profile');

    return this.prisma.vehicle.update({ where: { id: vehicleId }, data: { companyProfileId } });
  }

  async unassignVehicle(companyProfileId: string, callerId: string, vehicleId: string) {
    const company = await this.prisma.companyProfile.findUnique({ where: { id: companyProfileId } });
    if (!company) throw new NotFoundException('Company profile not found');
    if (company.ownerUserId !== callerId) throw new ForbiddenException('Only the company profile owner may remove vehicles from it');

    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    if (vehicle.companyProfileId !== companyProfileId) throw new NotFoundException('This vehicle is not assigned to this company profile');

    return this.prisma.vehicle.update({ where: { id: vehicleId }, data: { companyProfileId: null } });
  }
}
