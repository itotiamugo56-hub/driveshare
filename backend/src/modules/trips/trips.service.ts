import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/event-bus/event-bus.service';
import { EVT } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces/request-with-user';
import { PaymentsEscrowService } from '../payments-escrow/payments-escrow.service';
import { InsuranceService } from '../insurance/insurance.service';
import { TrustService } from '../trust/trust.service';
import { BookTripDto, PreviewTripDto } from './dto/trips.dto';

const DAY = 86_400_000;
export const MAX_TRIP_DAYS = 30;
/** Renters cancelling inside this window are flagged as late cancellations (trust module consumes the event). */
export const FREE_CANCEL_HOURS = 24;

export function parseDay(s: string): Date {
  const d = new Date(`${String(s).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(+d)) throw new BadRequestException('Dates must look like 2026-10-03.');
  return d;
}
export function tripDates(start: Date, days: number): Date[] {
  return Array.from({ length: days }, (_, i) => new Date(+start + i * DAY));
}

/**
 * Renter-facing booking orchestrator. Payments, deposits and insurance endpoints are SERVICE-role only,
 * so a renter's browser cannot drive them; this service calls the same domain services in-process on the
 * renter's behalf after doing every check itself. It compensates (voids the hold) if any later step fails.
 */
@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private prisma: PrismaService,
    private events: EventBusService,
    private payments: PaymentsEscrowService,
    private insurance: InsuranceService,
    private trust: TrustService,
  ) {}

  /** Price, eligibility and availability for a prospective trip. Writes nothing. */
  async preview(renterId: string, dto: PreviewTripDto) {
    const q = await this.quote(renterId, dto);
    const elig = await this.trust.checkEligibility(renterId, q.listing.id);
    return {
      days: q.days,
      currency: q.currency,
      rentalCents: q.rentalCents,
      dailyCoverCents: q.dailyCoverCents,
      coverCents: q.coverCents,
      deliveryCents: q.deliveryCents,
      totalCents: q.totalCents,
      depositCents: q.depositCents,
      instantBook: q.listing.instantBookEnabled,
      eligibility: { eligible: elig.eligible, reason: (elig as { reason?: string }).reason ?? null },
      freeCancellationUntil: new Date(+q.start - FREE_CANCEL_HOURS * 3_600_000).toISOString(),
    };
  }

  async book(renterId: string, dto: BookTripDto) {
    const q = await this.quote(renterId, dto);
    const { listing, tier } = q;
    if (listing.ownerId === renterId) throw new ForbiddenException("You can't book your own car.");

    const elig = await this.trust.checkEligibility(renterId, listing.id);
    if (!elig.eligible) throw new ForbiddenException('Your trust level does not meet this host\'s requirement yet.');

    const method = await this.prisma.paymentMethod.findFirst({ where: { id: dto.paymentMethodId, userId: renterId, status: 'active' } });
    if (!method) throw new BadRequestException('That payment method is not available. Choose or add a card.');

    const tripId = randomUUID();
    const check = await this.insurance.submitComprehensionCheck(renterId, tripId, dto.comprehensionAnswers);
    if (!check.passed) throw new BadRequestException('Please confirm all three cover questions to continue.');

    const instant = listing.instantBookEnabled;
    let authId: string | undefined;
    let depositId: string | undefined;
    let blocked = false;
    try {
      const auth = await this.payments.authorize(tripId, renterId, method.id, q.totalCents, q.currency);
      authId = auth.id;
      const deposit = await this.payments.preauthorizeDeposit(tripId, method.id, q.depositCents);
      depositId = deposit.id;
      let policyId: string | null = null;
      if (instant) {
        await this.block(listing.id, q.start, q.days); // re-checks availability under a serializable transaction
        blocked = true;
        policyId = (await this.insurance.bindPolicy(tripId, tier.id)).id;
      }
      const trip = await this.prisma.trip.create({
        data: {
          id: tripId, listingId: listing.id, vehicleId: listing.vehicleId, renterId, ownerId: listing.ownerId,
          startDate: q.start, endDate: q.end, days: q.days, currency: q.currency,
          rentalCents: q.rentalCents, coverCents: q.coverCents, deliveryCents: q.deliveryCents,
          totalCents: q.totalCents, depositCents: q.depositCents, coverageTierId: tier.id, paymentMethodId: method.id,
          authorizationId: authId, depositHoldId: depositId, policyId, status: instant ? 'confirmed' : 'requested',
        },
      });
      this.events.publish(instant ? EVT.TRIP_BOOKED : EVT.TRIP_REQUESTED, { tripId, listingId: listing.id, renterId, ownerId: listing.ownerId });
      return trip;
    } catch (e) {
      await this.compensate(authId, depositId, blocked ? { listingId: listing.id, start: q.start, days: q.days } : undefined);
      throw e;
    }
  }

  async mine(userId: string) {
    const trips = await this.prisma.trip.findMany({
      where: { OR: [{ renterId: userId }, { ownerId: userId }] },
      orderBy: { startDate: 'desc' },
    });
    // A host sees a renter's trust tier only on trips that renter has with them, never as a general lookup.
    const asOwner = trips.filter((t: { ownerId: string }) => t.ownerId === userId).map((t: { renterId: string }) => t.renterId);
    const scores = asOwner.length ? await this.prisma.trustScore.findMany({ where: { userId: { in: asOwner } } }) : [];
    const tierOf = new Map<string, string>(scores.map((s: { userId: string; tier: string }) => [s.userId, s.tier]));
    return trips.map((t: { renterId: string }) => (t.renterId === userId
      ? { ...t, role: 'renter' }
      : { ...t, role: 'owner', renterTier: tierOf.get(t.renterId) ?? null }));
  }

  async get(user: AuthenticatedUser, id: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundException('We could not find that trip.');
    const staff = ['admin', 'support_agent', 'arbitrator', 'service'].includes(user.role);
    if (!staff && trip.renterId !== user.userId && trip.ownerId !== user.userId) throw new ForbiddenException('This trip belongs to someone else.');
    return { ...trip, role: trip.renterId === user.userId ? 'renter' : trip.ownerId === user.userId ? 'owner' : 'staff' };
  }

  async cancel(user: AuthenticatedUser, id: string) {
    const trip = await this.get(user, id);
    if (trip.role === 'staff' && user.role !== 'admin') throw new ForbiddenException('Only the renter or host can cancel.');
    if (trip.status === 'cancelled') return trip;
    if (+trip.startDate <= Date.now()) throw new BadRequestException('This trip has already started, so it can no longer be cancelled here.');
    await this.compensate(trip.authorizationId, trip.depositHoldId, trip.status === 'confirmed' ? { listingId: trip.listingId, start: trip.startDate, days: trip.days } : undefined);
    const updated = await this.prisma.trip.update({ where: { id }, data: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: user.userId } });
    const hoursLeft = (+trip.startDate - Date.now()) / 3_600_000;
    if (trip.role === 'renter' && hoursLeft < FREE_CANCEL_HOURS)
      this.events.publish(EVT.TRIP_CANCELLED_LATE, { tripId: id, renterId: trip.renterId, hoursBeforePickup: Math.round(hoursLeft) });
    return updated;
  }

  /** Host approves or declines a request that was not instant-book. */
  async respond(ownerId: string, id: string, accept: boolean) {
    const trip = await this.prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundException('We could not find that trip.');
    if (trip.ownerId !== ownerId) throw new ForbiddenException('Only the host can answer this request.');
    if (trip.status !== 'requested') throw new BadRequestException('This request has already been answered.');
    if (!accept) {
      await this.compensate(trip.authorizationId, trip.depositHoldId, undefined);
      return this.prisma.trip.update({ where: { id }, data: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: ownerId } });
    }
    let blocked = false;
    try {
      await this.block(trip.listingId, trip.startDate, trip.days);
      blocked = true;
      const policy = await this.insurance.bindPolicy(trip.id, trip.coverageTierId);
      const updated = await this.prisma.trip.update({ where: { id }, data: { status: 'confirmed', policyId: policy.id } });
      this.events.publish(EVT.TRIP_CONFIRMED, { tripId: id, renterId: trip.renterId, ownerId });
      return updated;
    } catch (e) {
      if (blocked) await this.unblock(trip.listingId, trip.startDate, trip.days);
      throw e;
    }
  }

  // ------------------------------------------------------------------ internals

  private async quote(renterId: string, dto: PreviewTripDto) {
    const listing = await this.prisma.listing.findUnique({ where: { id: dto.listingId } });
    if (!listing || listing.status !== 'active') throw new NotFoundException('This car is not available to book.');

    const start = parseDay(dto.startDate);
    const end = parseDay(dto.endDate);
    const days = Math.round((+end - +start) / DAY);
    const today = parseDay(new Date().toISOString());
    if (days < 1) throw new BadRequestException('Return date must be after pick-up date.');
    if (days > MAX_TRIP_DAYS) throw new BadRequestException(`Trips can be up to ${MAX_TRIP_DAYS} days.`);
    if (+start < +today) throw new BadRequestException('Pick-up date can\'t be in the past.');

    const clash = await this.prisma.availabilityCalendar.count({
      where: { listingId: listing.id, date: { in: tripDates(start, days) }, status: { not: 'available' } },
    });
    if (clash > 0) throw new ConflictException('Some of those days are already taken. Pick different dates.');

    const tier = await this.prisma.coverageTier.findUnique({ where: { id: dto.coverageTierId } });
    if (!tier) throw new NotFoundException('That cover option does not exist.');
    const score = await this.prisma.trustScore.findUnique({ where: { userId: renterId } });

    const dailyCoverCents = this.insurance.estimateDailyPremiumCents(tier, { trustTier: score?.tier });
    const delivery = listing.deliveryOptions as { delivery?: boolean; fee?: number } | null;
    // deliveryOptions.fee is stored in currency units (e.g. 15 = $15.00), unlike *Cents fields.
    const deliveryCents = dto.includeDelivery && delivery?.delivery ? Math.round((delivery.fee ?? 0) * 100) : 0;
    const rentalCents = listing.basePriceCents * days;
    const coverCents = dailyCoverCents * days;
    return {
      listing, tier, start, end, days, currency: listing.currency,
      rentalCents, dailyCoverCents, coverCents, deliveryCents,
      totalCents: rentalCents + coverCents + deliveryCents,
      depositCents: tier.deductibleCents, // the hold equals the renter's maximum first-loss exposure
    };
  }

  private async block(listingId: string, start: Date, days: number) {
    const dates = tripDates(start, days);
    await this.prisma.$transaction(async (tx: any) => {
      const clash = await tx.availabilityCalendar.count({ where: { listingId, date: { in: dates }, status: { not: 'available' } } });
      if (clash > 0) throw new ConflictException('Someone else just booked those days. Pick different dates.');
      for (const date of dates)
        await tx.availabilityCalendar.upsert({
          where: { listingId_date: { listingId, date } },
          update: { status: 'booked' },
          create: { listingId, date, status: 'booked' },
        });
    }, { isolationLevel: 'Serializable' });
  }

  private async unblock(listingId: string, start: Date, days: number) {
    await this.prisma.availabilityCalendar.updateMany({
      where: { listingId, date: { in: tripDates(start, days) }, status: 'booked' },
      data: { status: 'available' },
    });
  }

  /** Best-effort rollback. Each step is independent so one failure never blocks the others. */
  private async compensate(authId?: string | null, depositId?: string | null, cal?: { listingId: string; start: Date; days: number }) {
    if (authId) await this.payments.void(authId).catch((e: Error) => this.logger.error(`void failed: ${e.message}`));
    if (depositId) await this.payments.releaseDeposit(depositId).catch((e: Error) => this.logger.error(`deposit release failed: ${e.message}`));
    if (cal) await this.unblock(cal.listingId, cal.start, cal.days).catch((e: Error) => this.logger.error(`unblock failed: ${e.message}`));
  }
}
