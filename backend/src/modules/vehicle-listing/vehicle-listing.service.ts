import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/event-bus/event-bus.service';
import { EVT } from '../../common/enums';
import { VinDecodeProvider } from '../../common/mock-providers/vin-decode.provider';
import { CvDamageProvider } from '../../common/mock-providers/cv-damage.provider';
import { PhotoStorageProvider } from '../../common/mock-providers/photo-storage.provider';
import { AvailabilityCalendar, AvailabilityStatus } from '@prisma/client';

const PHOTO_ORDER = { position: 'asc' as const };

@Injectable()
export class VehicleListingService {
  constructor(
    private prisma: PrismaService,
    private events: EventBusService,
    private vinDecode: VinDecodeProvider,
    private cvDamage: CvDamageProvider,
    private photoStorage: PhotoStorageProvider,
  ) {}

  async registerVehicle(ownerId: string, vin: string, licensePlate: string) {
    const decoded = await this.vinDecode.decode(vin);
    let vehicle;
    try {
      vehicle = await this.prisma.vehicle.create({
        data: {
          ownerId,
          vin,
          licensePlateEnc: Buffer.from(licensePlate).toString('base64'), // simplified inline encoding; production routes through KMS provider
          make: decoded.make,
          model: decoded.model,
          year: decoded.year,
          trim: decoded.trim,
          status: 'inactive',
        },
      });
    } catch (e) {
      // Prisma unique-constraint on Vehicle.vin: say so plainly instead of a 500.
      if ((e as { code?: string }).code === 'P2002') throw new ConflictException('This car (VIN) is already registered. If it is yours, contact support.');
      throw e;
    }
    this.events.publish(EVT.VEHICLE_REGISTERED, { vehicleId: vehicle.id, ownerId });
    return vehicle;
  }

  /** The caller's own vehicles (drafts included), newest first, with photos in cover order. */
  async myVehicles(ownerId: string) {
    return this.prisma.vehicle.findMany({ where: { ownerId }, include: { photos: { orderBy: PHOTO_ORDER } }, orderBy: { createdAt: 'desc' } });
  }

  /** The caller's own listings in every state except removed, with the vehicle and its photos. */
  async myListings(ownerId: string) {
    return this.prisma.listing.findMany({
      where: { ownerId, status: { not: 'removed' } },
      include: { vehicle: { include: { photos: { orderBy: PHOTO_ORDER } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getVehicle(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: { photos: { orderBy: PHOTO_ORDER } },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return vehicle;
  }

  /**
   * Added per explicit product decision (frontend architecture follow-up):
   * a public, read-only projection of a vehicle's display-safe fields —
   * everything a "vehicle hub" feed/detail page needs to render (make,
   * model, year, trim, specs, features, photos) and nothing else. Does
   * not select ownerId, vin, licensePlateEnc, ownershipDocTokenRef,
   * ownershipVerificationStatus, or telematicsDeviceId — those remain
   * reachable only through `getVehicle`, which is still auth-gated and
   * unchanged.
   */
  async getVehiclePublicSummary(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
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
        photos: { orderBy: PHOTO_ORDER, select: { id: true, vehicleId: true, url: true, position: true, createdAt: true } },
      },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return vehicle;
  }

  // Audit §3 High: seats/transmission/fuelType/mileageLimitPerDay/features now
  // live on the same record and go through the same ownership-checked path
  // make/model/year/trim already used, rather than a separate endpoint.
  async updateVehicle(
    vehicleId: string,
    callerId: string,
    data: Partial<{
      make: string;
      model: string;
      year: number;
      trim: string;
      seats: number;
      transmission: 'automatic' | 'manual';
      fuelType: 'gasoline' | 'diesel' | 'hybrid' | 'electric';
      mileageLimitPerDay: number;
      features: string[];
    }>,
  ) {
    const vehicle = await this.getVehicle(vehicleId);
    if (vehicle.ownerId !== callerId) throw new ForbiddenException('Only the vehicle owner may update this record');
    return this.prisma.vehicle.update({ where: { id: vehicleId }, data });
  }

  // Audit §3 Critical / §1 Critical: real photo storage, replacing the
  // "identical generic icon for every listing" state.
  async addVehiclePhoto(vehicleId: string, callerId: string, photoBase64: string, mimeType?: string) {
    const vehicle = await this.getVehicle(vehicleId);
    if (vehicle.ownerId !== callerId) throw new ForbiddenException('Only the vehicle owner may add photos to this vehicle');
    const { url } = await this.photoStorage.store(photoBase64, mimeType);
    const nextPosition = vehicle.photos.length;
    const photo = await this.prisma.vehiclePhoto.create({
      data: { vehicleId, url, position: nextPosition },
    });
    return photo;
  }

  async removeVehiclePhoto(vehicleId: string, photoId: string, callerId: string) {
    const vehicle = await this.getVehicle(vehicleId);
    if (vehicle.ownerId !== callerId) throw new ForbiddenException('Only the vehicle owner may remove photos from this vehicle');
    const photo = vehicle.photos.find((p) => p.id === photoId);
    if (!photo) throw new NotFoundException('Photo not found on this vehicle');
    await this.prisma.vehiclePhoto.delete({ where: { id: photoId } });
    return { deleted: true, photoId };
  }

  async reorderVehiclePhotos(vehicleId: string, photoIds: string[], callerId: string) {
    const vehicle = await this.getVehicle(vehicleId);
    if (vehicle.ownerId !== callerId) throw new ForbiddenException('Only the vehicle owner may reorder photos on this vehicle');
    const ownedIds = new Set(vehicle.photos.map((p) => p.id));
    const validOrder = photoIds.filter((id) => ownedIds.has(id));
    await this.prisma.$transaction(
      validOrder.map((id, position) => this.prisma.vehiclePhoto.update({ where: { id }, data: { position } })),
    );
    return this.getVehicle(vehicleId);
  }

  async uploadOwnershipDocument(vehicleId: string, callerId: string, documentBase64: string) {
    const vehicle = await this.getVehicle(vehicleId);
    if (vehicle.ownerId !== callerId) throw new ForbiddenException('Only the vehicle owner may upload ownership documents');
    const tokenRef = `ownership_${vehicleId}_${Date.now()}`; // in production: routed through Security & Compliance tokenization
    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { ownershipDocTokenRef: tokenRef, ownershipVerificationStatus: 'pending' },
    });
  }

  async submitConditionBaseline(
    vehicleId: string,
    dto: { type: string; tripId?: string; mediaAssetRefs: string[]; odometerReading?: number; fuelOrChargeLevel?: number },
  ) {
    await this.getVehicle(vehicleId);
    const cvResult = await this.cvDamage.analyzeCondition(dto.mediaAssetRefs);
    const baseline = await this.prisma.conditionBaseline.create({
      data: {
        vehicleId,
        tripId: dto.tripId,
        type: dto.type as any,
        mediaAssetRefs: dto.mediaAssetRefs,
        aiDamageAnnotations: cvResult.annotations as any,
        odometerReading: dto.odometerReading,
        fuelOrChargeLevel: dto.fuelOrChargeLevel,
      },
    });
    this.events.publish(EVT.CONDITION_BASELINE_CAPTURED, { vehicleId, baselineId: baseline.id, type: dto.type, tripId: dto.tripId });
    return baseline;
  }

  async getLatestConditionBaseline(vehicleId: string) {
    const baseline = await this.prisma.conditionBaseline.findFirst({
      where: { vehicleId },
      orderBy: { capturedAt: 'desc' },
    });
    if (!baseline) throw new NotFoundException('No condition baseline recorded yet');
    return baseline;
  }

  async decodeVin(vin: string) {
    return this.vinDecode.decode(vin);
  }

  async createListing(
    ownerId: string,
    dto: {
      vehicleId: string;
      basePriceCents: number;
      currency?: string;
      description?: string;
      locationLat?: number;
      locationLng?: number;
      locationLabel?: string;
      instantBookEnabled?: boolean;
      deliveryOptions?: any;
      minimumTrustTier?: string;
    },
  ) {
    const vehicle = await this.getVehicle(dto.vehicleId);
    if (vehicle.ownerId !== ownerId) throw new ForbiddenException('Only the vehicle owner may create a listing for it');
    const listing = await this.prisma.listing.create({
      data: {
        vehicleId: dto.vehicleId,
        ownerId,
        basePriceCents: dto.basePriceCents,
        currency: dto.currency ?? 'USD',
        description: dto.description,
        locationLat: dto.locationLat,
        locationLng: dto.locationLng,
        locationLabel: dto.locationLabel,
        instantBookEnabled: dto.instantBookEnabled ?? true,
        deliveryOptions: dto.deliveryOptions ?? { delivery: false, radius_km: 0, fee: 0 },
        minimumTrustTier: dto.minimumTrustTier as any,
        status: 'draft',
      },
    });
    return listing;
  }

  async getListing(listingId: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Listing not found');
    return listing;
  }

  async updateListing(listingId: string, callerId: string, data: any) {
    const listing = await this.getListing(listingId);
    if (listing.ownerId !== callerId) throw new ForbiddenException('Only the listing owner may update it');
    if (data.status === 'active') await this.assertCanPublish(callerId, listing.vehicleId);
    const updated = await this.prisma.listing.update({ where: { id: listingId }, data });
    if (data.status === 'active') {
      this.events.publish(EVT.LISTING_PUBLISHED, { listingId, ownerId: listing.ownerId });
    }
    return updated;
  }

  async deactivateListing(listingId: string, callerId: string) {
    const listing = await this.getListing(listingId);
    if (listing.ownerId !== callerId) throw new ForbiddenException('Only the listing owner may remove it');
    return this.prisma.listing.update({ where: { id: listingId }, data: { status: 'removed' } });
  }

  /**
   * Rebuilt to close audit §4 (Critical: "no recommendation or relevance
   * logic at all"; Critical: "availability is not part of filtering"; High:
   * "'newest first' ordering is undisclosed") and to support §1 Critical
   * ("no map-based or location-aware search") and §1 High ("no date-range
   * availability search").
   *
   * Filtering:
   *  - status/price, as before.
   *  - `startDate`/`endDate`: excludes any listing with an
   *    AvailabilityCalendar entry in {booked, owner_blocked, maintenance_hold}
   *    overlapping the requested range — a listing that cannot actually be
   *    booked for the renter's dates no longer appears at all, rather than
   *    ranking identically to an open one.
   *
   * Ranking ("recommended", the default and only non-degenerate mode):
   *  - proximity: if the caller supplies lat/lng, a listing's distance (via
   *    the haversine formula, since no PostGIS/search-index exists — see the
   *    original code comment this replaces) is normalized against `radiusKm`
   *    (default 50km) and contributes up to 0.35 of the score. Listings with
   *    no location on file, or callers with no lat/lng, get a neutral 0.5
   *    contribution rather than being penalized for missing data.
   *  - owner reliability: the owner's TrustScore.overallScore (0–850 scale),
   *    normalized to 0–1, contributes up to 0.30.
   *  - review rating: the average visible Review.rating for the owner as
   *    subject, normalized (1–5 -> 0–1), contributes up to 0.25. Owners with
   *    no reviews yet get a neutral 0.5 rather than being penalized.
   *  - instant-book: a flat 0.10 bonus if instantBookEnabled, since it
   *    reduces renter friction independent of the above.
   * These weights are intentionally simple and documented here rather than
   * hidden — a production system would tune them from booking-conversion
   * data, but "some disclosed, reasoned blend" is the fix for "no logic at
   * all", not a claim that these exact weights are final.
   *
   * `sort` is returned alongside the results as `meta.sort`/`meta.sortLabel`
   * so the frontend can render a "Sorted by: X" label — the ordering is never
   * silently applied without being named to the caller.
   */
  async searchListings(filters: {
    minPrice?: number;
    maxPrice?: number;
    deliveryOnly?: boolean;
    startDate?: string;
    endDate?: string;
    lat?: number;
    lng?: number;
    radiusKm?: number;
    sort?: 'recommended' | 'price' | 'distance' | 'newest';
  }) {
    const sort = filters.sort ?? 'recommended';
    const radiusKm = filters.radiusKm ?? 50;

    const listings = await this.prisma.listing.findMany({
      where: {
        status: 'active',
        basePriceCents: { gte: filters.minPrice ?? undefined, lte: filters.maxPrice ?? undefined },
        ...(filters.deliveryOnly
          ? { deliveryOptions: { path: ['delivery'], equals: true } }
          : {}),
      },
      include: { vehicle: { include: { photos: { orderBy: PHOTO_ORDER, take: 1 } } }, availability: true },
      take: 200, // widen the pre-filter pool since date/ranking filtering happens in-process below
      orderBy: { createdAt: 'desc' },
    });

    const available = filters.startDate && filters.endDate
      ? listings.filter((l) => this.isAvailableForRange(l.availability, filters.startDate!, filters.endDate!))
      : listings;

    const ownerIds = [...new Set(available.map((l) => l.ownerId))];
    const [trustScores, reviewAverages] = await Promise.all([
      this.prisma.trustScore.findMany({ where: { userId: { in: ownerIds } } }),
      this.prisma.review.groupBy({
        by: ['subjectUserId'],
        where: { subjectUserId: { in: ownerIds }, visibility: 'visible' },
        _avg: { rating: true },
      }),
    ]);
    const trustByOwner = new Map<string, number>(trustScores.map((t) => [t.userId, Number(t.overallScore)]));
    const ratingByOwner = new Map<string, number | null>(
      reviewAverages.map((r) => [r.subjectUserId, r._avg.rating != null ? Number(r._avg.rating) : null]),
    );

    const scored = available.map((listing) => {
      const distanceKm =
        filters.lat != null && filters.lng != null && listing.locationLat != null && listing.locationLng != null
          ? this.haversineKm(filters.lat, filters.lng, listing.locationLat, listing.locationLng)
          : null;
      const proximityScore = distanceKm == null ? 0.5 : Math.max(0, 1 - distanceKm / radiusKm);
      const trustRaw = trustByOwner.get(listing.ownerId);
      const trustScore = trustRaw == null ? 0.5 : Math.min(1, Math.max(0, trustRaw / 850));
      const ratingRaw = ratingByOwner.get(listing.ownerId);
      const ratingScore = ratingRaw == null ? 0.5 : Math.min(1, Math.max(0, (ratingRaw - 1) / 4));
      const instantBonus = listing.instantBookEnabled ? 0.1 : 0;
      const recommendedScore = proximityScore * 0.35 + trustScore * 0.3 + ratingScore * 0.25 + instantBonus;
      return { listing, distanceKm, recommendedScore, avgRating: ratingRaw };
    });

    const sortLabels: Record<string, string> = {
      recommended: 'Recommended',
      price: 'Price: low to high',
      distance: 'Distance: nearest first',
      newest: 'Newest listings',
    };

    scored.sort((a, b) => {
      switch (sort) {
        case 'price':
          return a.listing.basePriceCents - b.listing.basePriceCents;
        case 'distance':
          return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
        case 'newest':
          return b.listing.createdAt.getTime() - a.listing.createdAt.getTime();
        case 'recommended':
        default:
          return b.recommendedScore - a.recommendedScore;
      }
    });

    return {
      meta: { sort, sortLabel: sortLabels[sort] },
      results: scored.slice(0, 50).map(({ listing, distanceKm, avgRating }) => ({
        ...listing,
        distanceKm,
        ownerAvgRating: avgRating ?? null,
      })),
    };
  }

  private isAvailableForRange(entries: AvailabilityCalendar[], startDate: string, endDate: string): boolean {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    const blocking: AvailabilityStatus[] = ['booked', 'owner_blocked', 'maintenance_hold'];
    return !entries.some((e) => {
      const d = e.date.getTime();
      return d >= start && d <= end && blocking.includes(e.status);
    });
  }

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  async getCalendar(listingId: string) {
    return this.prisma.availabilityCalendar.findMany({ where: { listingId }, orderBy: { date: 'asc' } });
  }

  async updateCalendar(listingId: string, callerId: string, entries: { date: string; status: string }[]) {
    const listing = await this.getListing(listingId);
    if (listing.ownerId !== callerId) throw new ForbiddenException('Only the listing owner may edit its calendar');

    // Owners may open or block days. 'booked' belongs to confirmed trips, and a booked day can't be
    // reopened here, or a renter's confirmed trip could be double-booked.
    const OWNER_SETTABLE = ['available', 'owner_blocked', 'maintenance_hold'];
    const parsed = entries.map((e) => {
      const date = new Date(`${String(e.date).slice(0, 10)}T00:00:00.000Z`);
      if (Number.isNaN(+date)) throw new BadRequestException(`"${e.date}" is not a valid date. Use YYYY-MM-DD.`);
      if (!OWNER_SETTABLE.includes(e.status)) throw new BadRequestException('Days become booked automatically when a trip is confirmed. You can open or block days.');
      return { date, status: e.status };
    });
    const existing = await this.prisma.availabilityCalendar.findMany({ where: { listingId, date: { in: parsed.map((p) => p.date) }, status: 'booked' } });
    if (existing.length > 0)
      throw new ConflictException(`${existing[0].date.toISOString().slice(0, 10)} is booked by a renter. Cancel that trip first if you need the day back.`);

    const results: AvailabilityCalendar[] = [];
    for (const entry of parsed) {
      const row = await this.prisma.availabilityCalendar.upsert({
        where: { listingId_date: { listingId, date: entry.date } },
        update: { status: entry.status as any },
        create: { listingId, date: entry.date, status: entry.status as any },
      });
      results.push(row);
    }
    this.events.publish(EVT.CALENDAR_UPDATED, { listingId, entryCount: results.length });
    return results;
  }

  // ---------------------------------------------------------------------------
  // Host vetting
  // ---------------------------------------------------------------------------

  /** Set ENFORCE_HOST_VETTING=false to switch the publish gate off (local smoke tests only). */
  private vettingEnforced() {
    return (process.env.ENFORCE_HOST_VETTING ?? 'true').toLowerCase() !== 'false';
  }

  /** Owner-level checks that apply to every vehicle: verified identity and a valid, unexpired licence. */
  private async ownerChecks(userId: string) {
    const [session, license] = await Promise.all([
      this.prisma.verificationSession.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.licenseRecord.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    ]);
    const identity = session?.status === 'approved';
    const licence = !!license && license.dmvValidationStatus === 'valid' && license.expirationDate.getTime() > Date.now();
    return { identity, licence };
  }

  /** Throws a 403 that names the first unmet requirement, so the UI can send the owner to the right step. */
  async assertCanPublish(ownerId: string, vehicleId: string) {
    if (!this.vettingEnforced()) return;
    const [{ identity, licence }, vehicle] = await Promise.all([
      this.ownerChecks(ownerId),
      this.prisma.vehicle.findUnique({ where: { id: vehicleId } }),
    ]);
    if (!identity) throw new ForbiddenException('HOST_VETTING_REQUIRED: confirm your identity before going live');
    if (!licence) throw new ForbiddenException('HOST_VETTING_REQUIRED: add a valid driving licence before going live');
    if (!vehicle || vehicle.ownershipVerificationStatus !== 'verified') {
      throw new ForbiddenException('HOST_VETTING_REQUIRED: this car\'s ownership document has not been approved yet');
    }
  }

  /**
   * One call that tells the front end who this person is as a host: whether they own cars,
   * which vetting steps are done, and what to do next. Drives navigation and the verification centre.
   */
  async hostingStatus(userId: string) {
    const [vehicles, { identity, licence }] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: { ownerId: userId },
        select: { id: true, make: true, model: true, year: true, ownershipVerificationStatus: true, ownershipDocTokenRef: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.ownerChecks(userId),
    ]);
    const cars = vehicles.map((v) => ({
      vehicleId: v.id,
      label: `${v.year} ${v.make} ${v.model}`,
      ownership: v.ownershipVerificationStatus as 'pending' | 'verified' | 'rejected',
      documentSubmitted: !!v.ownershipDocTokenRef,
    }));
    const anyOwnershipVerified = cars.some((c) => c.ownership === 'verified');
    const needsDoc = cars.find((c) => !c.documentSubmitted || c.ownership === 'rejected');
    let nextStep: 'identity' | 'licence' | 'ownership' | 'none' = 'none';
    if (cars.length > 0) {
      if (!identity) nextStep = 'identity';
      else if (!licence) nextStep = 'licence';
      else if (needsDoc || !anyOwnershipVerified) nextStep = 'ownership';
    }
    return {
      ownsVehicles: cars.length > 0,
      identityVerified: identity,
      licenceValid: licence,
      cars,
      canPublish: identity && licence && anyOwnershipVerified,
      nextStep,
    };
  }

  /** Staff decision on an uploaded ownership document. */
  async reviewOwnership(vehicleId: string, decision: 'verified' | 'rejected') {
    const vehicle = await this.getVehicle(vehicleId);
    if (!vehicle.ownershipDocTokenRef) throw new BadRequestException('No ownership document has been uploaded for this vehicle');
    return this.prisma.vehicle.update({ where: { id: vehicleId }, data: { ownershipVerificationStatus: decision } });
  }
}
