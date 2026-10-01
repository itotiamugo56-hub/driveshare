import { z } from 'zod';

/**
 * Runtime response validation for the Vehicle & Listing domain.
 *
 * Audit finding addressed: `zod` was a declared but unused dependency —
 * the API layer had compile-time types only, with no guarantee that a
 * response actually matches its declared shape. Scope is deliberately
 * limited to the Vehicle & Listing domain (plus the Trust/Review fields
 * embedded in search results), because that is the domain the "vehicle
 * hub" feed/detail screens consume. Extending runtime validation to the
 * other 12 backend domains was not part of the audited gap and is called
 * out as excluded in the implementation summary.
 */

export const vehiclePhotoSchema = z.object({
  id: z.string(),
  vehicleId: z.string(),
  url: z.string(), // data: URI in mock mode (see PhotoStorageProvider), real object-store URL in live mode
  position: z.number(),
  createdAt: z.string(),
});

export const vehicleSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  vin: z.string(),
  make: z.string(),
  model: z.string(),
  year: z.number(),
  trim: z.string().nullable().optional(),
  seats: z.number().nullable().optional(),
  transmission: z.enum(['automatic', 'manual']).nullable().optional(),
  fuelType: z.enum(['gasoline', 'diesel', 'hybrid', 'electric']).nullable().optional(),
  mileageLimitPerDay: z.number().nullable().optional(),
  features: z.array(z.string()).default([]),
  status: z.string(),
  photos: z.array(vehiclePhotoSchema).default([]),
});

/**
 * `GET /vehicles/:vehicleId/public-summary` — the @Public() projection added
 * to close the "anonymous visitor can't see photos/specs" gap. Deliberately
 * a narrower schema than `vehicleSchema`: no ownerId/vin/licensePlateEnc/
 * ownershipDocTokenRef/ownershipVerificationStatus/telematicsDeviceId/status,
 * matching exactly what `VehicleListingService.getVehiclePublicSummary`
 * selects on the backend. If the backend's `select` ever drifts to include
 * a sensitive field, this schema will NOT catch that (zod only validates
 * shape, not absence of extra fields, by default) — the backend `select`
 * remains the actual enforcement point, not this schema.
 */
export const vehiclePublicSummarySchema = z.object({
  id: z.string(),
  make: z.string(),
  model: z.string(),
  year: z.number(),
  trim: z.string().nullable().optional(),
  seats: z.number().nullable().optional(),
  transmission: z.enum(['automatic', 'manual']).nullable().optional(),
  fuelType: z.enum(['gasoline', 'diesel', 'hybrid', 'electric']).nullable().optional(),
  mileageLimitPerDay: z.number().nullable().optional(),
  features: z.array(z.string()).default([]),
  photos: z.array(vehiclePhotoSchema).default([]),
});

export const deliveryOptionsSchema = z.object({
  delivery: z.boolean(),
  radius_km: z.number(),
  fee: z.number(),
});

/** Shared listing fields, present on both the plain `getListing` response and search rows. */
const listingBase = {
  id: z.string(),
  vehicleId: z.string(),
  ownerId: z.string(),
  basePriceCents: z.number(),
  currency: z.string(),
  description: z.string().nullable().optional(),
  locationLat: z.number().nullable().optional(),
  locationLng: z.number().nullable().optional(),
  locationLabel: z.string().nullable().optional(),
  instantBookEnabled: z.boolean(),
  deliveryOptions: deliveryOptionsSchema,
  minimumTrustTier: z.enum(['new', 'standard', 'trusted', 'elite']).nullable().optional(),
  status: z.enum(['draft', 'active', 'paused', 'removed']),
  createdAt: z.string(),
  updatedAt: z.string(),
};

/** `GET /listings/:id` — flat listing, no nested vehicle/photos. */
export const listingDetailSchema = z.object(listingBase);

/**
 * `GET /listings/search` result row. Only present here (not on `listingDetailSchema`)
 * because `VehicleListingService.searchListings` specifically `include`s
 * `vehicle.photos` (first photo only) and attaches `distanceKm`/`ownerAvgRating`.
 */
export const listingSearchResultSchema = z.object({
  ...listingBase,
  vehicle: z.object({
    id: z.string(),
    make: z.string(),
    model: z.string(),
    year: z.number(),
    trim: z.string().nullable().optional(),
    photos: z.array(vehiclePhotoSchema).default([]),
  }),
  distanceKm: z.number().nullable(),
  ownerAvgRating: z.number().nullable(),
});

export const listingSearchResponseSchema = z.object({
  meta: z.object({
    sort: z.enum(['recommended', 'price', 'distance', 'newest']),
    sortLabel: z.string(),
  }),
  results: z.array(listingSearchResultSchema),
});

export type VehiclePhoto = z.infer<typeof vehiclePhotoSchema>;
export type Vehicle = z.infer<typeof vehicleSchema>;
export type VehiclePublicSummary = z.infer<typeof vehiclePublicSummarySchema>;
export type ListingDetail = z.infer<typeof listingDetailSchema>;
export type ListingSearchResult = z.infer<typeof listingSearchResultSchema>;
export type ListingSearchResponse = z.infer<typeof listingSearchResponseSchema>;

export const availabilityCalendarEntrySchema = z.object({
  id: z.string(),
  listingId: z.string(),
  date: z.string(),
  status: z.enum(['available', 'booked', 'owner_blocked', 'maintenance_hold']),
});
export type AvailabilityCalendarEntry = z.infer<typeof availabilityCalendarEntrySchema>;
