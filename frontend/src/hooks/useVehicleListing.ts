import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { vehicleListingApi, type SearchListingsParams } from '../api/domains/vehicleListing.api';
import { useAuthStore } from '../store/authStore';

/**
 * Audit gap addressed: "No state layer for product/domain data (listings,
 * filters, pagination, selected vehicle)". Server state (search results,
 * a single listing, a vehicle's photos) is modeled here with React Query,
 * which is what that dependency was already declared for. Filter/sort
 * state itself lives in the URL (`useSearchParams`, in VehicleHubPage),
 * not in a new store — see the implementation summary for why a new
 * Zustand store was not added for this.
 */

export function useListingSearch(params: SearchListingsParams) {
  return useQuery({
    queryKey: ['listings', 'search', params],
    queryFn: () => vehicleListingApi.searchListings(params),
  });
}

export function useListingDetail(listingId: string | undefined) {
  return useQuery({
    queryKey: ['listings', listingId],
    queryFn: () => vehicleListingApi.getPublicListing(listingId!),
    enabled: !!listingId,
  });
}

export function useVehicle(vehicleId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['vehicles', vehicleId],
    queryFn: () => vehicleListingApi.getVehicle(vehicleId!, token),
    enabled: !!vehicleId,
  });
}

/**
 * Backs the public listing-detail view. Calls the @Public()
 * `getVehiclePublicSummary` endpoint added to close the "anonymous visitor
 * can't see photos/specs" gap — no token is read or sent, matching the
 * endpoint's actual auth requirement (none). Distinct from `useVehicle`
 * above, which still requires auth and is used only by the owner-facing
 * `VehiclePhotoManagerPage`.
 */
export function useVehiclePublicSummary(vehicleId: string | undefined) {
  return useQuery({
    queryKey: ['vehicles', vehicleId, 'public-summary'],
    queryFn: () => vehicleListingApi.getVehiclePublicSummary(vehicleId!),
    enabled: !!vehicleId,
  });
}

export function useListingCalendar(listingId: string | undefined) {
  return useQuery({
    queryKey: ['listings', listingId, 'calendar'],
    queryFn: () => vehicleListingApi.getCalendar(listingId!),
    enabled: !!listingId,
  });
}

export function useAddVehiclePhoto(vehicleId: string) {
  const token = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ photoBase64, mimeType }: { photoBase64: string; mimeType?: string }) =>
      vehicleListingApi.addVehiclePhoto(vehicleId, photoBase64, mimeType, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles', vehicleId] }),
  });
}

export function useRemoveVehiclePhoto(vehicleId: string) {
  const token = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoId: string) => vehicleListingApi.removeVehiclePhoto(vehicleId, photoId, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles', vehicleId] }),
  });
}

export function useReorderVehiclePhotos(vehicleId: string) {
  const token = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoIds: string[]) => vehicleListingApi.reorderVehiclePhotos(vehicleId, photoIds, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles', vehicleId] }),
  });
}
