import { request } from '../client';
import {
  listingDetailSchema,
  listingSearchResponseSchema,
  vehiclePhotoSchema,
  vehicleSchema,
  vehiclePublicSummarySchema,
  availabilityCalendarEntrySchema,
  type ListingDetail,
  type ListingSearchResponse,
  type VehiclePhoto,
  type Vehicle,
  type VehiclePublicSummary,
  type AvailabilityCalendarEntry,
} from '../schemas/vehicleListing.schemas';

/**
 * Audit gap addressed: `vehicleListingApi` wrapped 15 of the backend's 18
 * `vehicle-listing` endpoints. The three vehicle-photo endpoints
 * (`POST/DELETE/PUT .../photos*`) had no wrapper at all, which meant the
 * one capability most central to a photo-driven feed ("vehicle hub") could
 * not be called from the frontend in any form. Added below, matching
 * `AddVehiclePhotoDto`/`ReorderVehiclePhotosDto` exactly
 * (backend/src/modules/vehicle-listing/dto/vehicle-listing.dto.ts).
 *
 * Audit gap addressed: `searchListings` only forwarded `minPrice`,
 * `maxPrice`, `delivery` — a param that does not even exist on
 * `SearchListingsQueryDto` (the backend field is `deliveryOnly`), so the
 * delivery filter silently never applied. `startDate`, `endDate`, `lat`,
 * `lng`, `radiusKm`, and `sort` were also missing, so the backend's
 * date-availability filtering, proximity search, and disclosed
 * "recommended" ranking were unreachable. All fields on
 * `SearchListingsQueryDto` are now forwarded, under their correct names.
 *
 * Audit gap addressed: no runtime validation existed on any response.
 * `zod` was a declared, unused dependency (see prior audit §(a)/(b)).
 * Responses that back the feed/detail screens are now parsed through the
 * schemas in `../schemas/vehicleListing.schemas.ts`; a shape mismatch
 * against the actual backend now throws immediately at the call site
 * instead of surfacing as an unexplained `undefined` deep in a component.
 */

export interface SearchListingsParams {
  minPrice?: number;
  maxPrice?: number;
  /** Renamed from the previous `delivery` to match `SearchListingsQueryDto.deliveryOnly`. */
  deliveryOnly?: boolean;
  /** ISO date (YYYY-MM-DD). Both must be set together to activate availability filtering. */
  startDate?: string;
  endDate?: string;
  lat?: number;
  lng?: number;
  /** Only meaningful together with lat/lng. Backend default is 50km if omitted. */
  radiusKm?: number;
  sort?: 'recommended' | 'price' | 'distance' | 'newest';
}

export const vehicleListingApi = {
  registerVehicle: (vin: string, licensePlate: string, token?: string | null) =>
    request({ method: 'POST', url: '/vehicles', data: { vin, licensePlate }, token }),

  getVehicle: async (vehicleId: string, token?: string | null): Promise<Vehicle> => {
    const body = await request({ method: 'GET', url: `/vehicles/${vehicleId}`, token });
    return vehicleSchema.parse(body);
  },

  /**
   * New. Backend: `GET /vehicles/:vehicleId/public-summary` (@Public()).
   * Added to close the audited gap where an anonymous visitor could load a
   * public listing (`getPublicListing` below) but not its photos/specs,
   * since `getVehicle` above requires auth. Returns a narrower field set
   * than `getVehicle` by design — see `vehiclePublicSummarySchema`.
   */
  getVehiclePublicSummary: async (vehicleId: string): Promise<VehiclePublicSummary> => {
    const body = await request({ method: 'GET', url: `/vehicles/${vehicleId}/public-summary`, token: null });
    return vehiclePublicSummarySchema.parse(body);
  },

  updateVehicle: (vehicleId: string, data: Record<string, unknown>, token?: string | null) =>
    request({ method: 'PUT', url: `/vehicles/${vehicleId}`, data, token }),

  /** New. Backend: `POST /vehicles/:vehicleId/photos` (AddVehiclePhotoDto). */
  addVehiclePhoto: async (
    vehicleId: string,
    photoBase64: string,
    mimeType?: string,
    token?: string | null,
  ): Promise<VehiclePhoto> => {
    const body = await request({
      method: 'POST',
      url: `/vehicles/${vehicleId}/photos`,
      data: { photoBase64, mimeType },
      token,
    });
    return vehiclePhotoSchema.parse(body);
  },

  /** New. Backend: `DELETE /vehicles/:vehicleId/photos/:photoId`. */
  removeVehiclePhoto: (vehicleId: string, photoId: string, token?: string | null) =>
    request<{ deleted: boolean; photoId: string }>({
      method: 'DELETE',
      url: `/vehicles/${vehicleId}/photos/${photoId}`,
      token,
    }),

  /**
   * New. Backend: `PUT /vehicles/:vehicleId/photos/order` (ReorderVehiclePhotosDto).
   * `photoIds` must be the full, ordered set of photo IDs already on the vehicle —
   * the backend silently drops any id not already owned by this vehicle
   * (VehicleListingService.reorderVehiclePhotos), it does not add or remove photos.
   */
  reorderVehiclePhotos: async (vehicleId: string, photoIds: string[], token?: string | null): Promise<Vehicle> => {
    const body = await request({
      method: 'PUT',
      url: `/vehicles/${vehicleId}/photos/order`,
      data: { photoIds },
      token,
    });
    return vehicleSchema.parse(body);
  },

  uploadOwnershipDocument: (vehicleId: string, documentBase64: string, token?: string | null) =>
    request({ method: 'POST', url: `/vehicles/${vehicleId}/ownership-documents`, data: { documentBase64 }, token }),

  submitConditionBaseline: (
    vehicleId: string,
    body: { type: string; tripId?: string; mediaAssetRefs: string[]; odometerReading?: number },
    token?: string | null,
  ) => request({ method: 'POST', url: `/vehicles/${vehicleId}/condition-baseline`, data: body, token }),

  getLatestConditionBaseline: (vehicleId: string, token?: string | null) =>
    request({ method: 'GET', url: `/vehicles/${vehicleId}/condition-baseline/latest`, token }),

  decodeVin: (vin: string, token?: string | null) =>
    request({ method: 'POST', url: '/vehicles/vin-decode', data: { vin }, token }),

  createListing: (body: Record<string, unknown>, token?: string | null) =>
    request({ method: 'POST', url: '/listings', data: body, token }),

  /** Params expanded to cover every field on `SearchListingsQueryDto`; response validated and typed. */
  searchListings: async (params: SearchListingsParams, token?: string | null): Promise<ListingSearchResponse> => {
    const body = await request({ method: 'GET', url: '/listings/search', params, token });
    return listingSearchResponseSchema.parse(body);
  },

  /** The only truly @Public endpoint in this domain — no token required or sent. */
  getPublicListing: async (listingId: string): Promise<ListingDetail> => {
    const body = await request({ method: 'GET', url: `/listings/${listingId}`, token: null });
    return listingDetailSchema.parse(body);
  },

  updateListing: (listingId: string, data: Record<string, unknown>, token?: string | null) =>
    request({ method: 'PUT', url: `/listings/${listingId}`, data, token }),

  deactivateListing: (listingId: string, token?: string | null) =>
    request({ method: 'DELETE', url: `/listings/${listingId}`, token }),

  getCalendar: async (listingId: string, token?: string | null): Promise<AvailabilityCalendarEntry[]> => {
    const body = await request({ method: 'GET', url: `/listings/${listingId}/calendar`, token });
    return availabilityCalendarEntrySchema.array().parse(body);
  },

  updateCalendar: (listingId: string, entries: unknown[], token?: string | null) =>
    request({ method: 'PUT', url: `/listings/${listingId}/calendar`, data: { entries }, token }),

  /** Flagged stub — see architecture doc §1.3/§1.14. Included for completeness; do not
   * build UI expecting real pricing data from it. */
  pricingSuggestionProxy: (listingId: string, token?: string | null) =>
    request({ method: 'POST', url: `/listings/${listingId}/pricing-suggestion`, token }),
};
