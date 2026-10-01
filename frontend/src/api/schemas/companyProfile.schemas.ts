import { z } from 'zod';
import { vehiclePhotoSchema, listingDetailSchema } from './vehicleListing.schemas';

/**
 * Added per explicit product decision (verification-check follow-up, "company/
 * business profile" gap). Mirrors `CompanyProfileService.getCompanyProfile`'s
 * `select` exactly (backend/src/modules/company-profile/company-profile.service.ts)
 * — no `vin`/`ownerId`/`ownershipDocTokenRef`/etc. fields, matching the same
 * public-projection pattern used by `vehiclePublicSummarySchema`.
 */
export const companyVehicleSchema = z.object({
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
  // Nested active listings for this vehicle use the same shape as a standalone
  // `GET /listings/:id` response (listingDetailSchema) — the backend selects
  // the identical field set.
  listings: z.array(listingDetailSchema).default([]),
});

export const companyProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  vehicles: z.array(companyVehicleSchema).default([]),
});

export type CompanyVehicle = z.infer<typeof companyVehicleSchema>;
export type CompanyProfile = z.infer<typeof companyProfileSchema>;
