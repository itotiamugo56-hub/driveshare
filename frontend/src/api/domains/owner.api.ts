import { request } from '../client';

export interface OwnerPhoto { id: string; url: string; position: number }
export interface OwnerVehicle {
  id: string; vin: string; make: string; model: string; year: number; trim?: string | null;
  seats?: number | null; transmission?: 'automatic' | 'manual' | null; fuelType?: 'gasoline' | 'diesel' | 'hybrid' | 'electric' | null;
  mileageLimitPerDay?: number | null; features: string[]; status: string; photos: OwnerPhoto[];
}
export interface OwnerListing {
  id: string; vehicleId: string; basePriceCents: number; currency: string; description?: string | null; locationLabel?: string | null;
  instantBookEnabled: boolean; deliveryOptions: { delivery: boolean; radius_km: number; fee: number }; minimumTrustTier?: string | null;
  status: 'draft' | 'active' | 'paused' | 'removed'; vehicle?: OwnerVehicle;
}
export type OwnershipState = 'pending' | 'verified' | 'rejected';
export interface HostingStatus {
  ownsVehicles: boolean;
  identityVerified: boolean;
  licenceValid: boolean;
  cars: { vehicleId: string; label: string; ownership: OwnershipState; documentSubmitted: boolean }[];
  canPublish: boolean;
  nextStep: 'identity' | 'licence' | 'ownership' | 'none';
}
export interface VinDecoded { make: string; model: string; year: number; trim?: string }

export interface CalendarDay { date: string; status: 'available' | 'booked' | 'owner_blocked' | 'maintenance_hold' }

export const ownerApi = {
  hostingStatus: (t?: string | null) => request({ method: 'GET', url: '/hosting/status', token: t }) as Promise<HostingStatus>,
  uploadOwnershipDoc: (vehicleId: string, documentBase64: string, t?: string | null) =>
    request({ method: 'POST', url: `/vehicles/${vehicleId}/ownership-documents`, data: { documentBase64 }, token: t }) as Promise<{ ownershipVerificationStatus: OwnershipState }>,
  getCalendar: (listingId: string, t?: string | null) => request({ method: 'GET', url: `/listings/${listingId}/calendar`, token: t }) as Promise<CalendarDay[]>,
  updateCalendar: (listingId: string, entries: { date: string; status: string }[], t?: string | null) => request({ method: 'PUT', url: `/listings/${listingId}/calendar`, data: { entries }, token: t }) as Promise<CalendarDay[]>,
  myVehicles: (t?: string | null) => request({ method: 'GET', url: '/vehicles/mine', token: t }) as Promise<OwnerVehicle[]>,
  myListings: (t?: string | null) => request({ method: 'GET', url: '/listings/mine', token: t }) as Promise<OwnerListing[]>,
  decodeVin: (vin: string, t?: string | null) => request({ method: 'POST', url: '/vehicles/vin-decode', data: { vin }, token: t }) as Promise<VinDecoded>,
  registerVehicle: (vin: string, licensePlate: string, t?: string | null) => request({ method: 'POST', url: '/vehicles', data: { vin, licensePlate }, token: t }) as Promise<OwnerVehicle>,
  updateVehicle: (id: string, data: Record<string, unknown>, t?: string | null) => request({ method: 'PUT', url: `/vehicles/${id}`, data, token: t }) as Promise<OwnerVehicle>,
  createListing: (data: Record<string, unknown>, t?: string | null) => request({ method: 'POST', url: '/listings', data, token: t }) as Promise<OwnerListing>,
  updateListing: (id: string, data: Record<string, unknown>, t?: string | null) => request({ method: 'PUT', url: `/listings/${id}`, data, token: t }) as Promise<OwnerListing>,
  marketPrices: async (t?: string | null) => {
    const r = (await request({ method: 'GET', url: '/listings/search', token: t })) as { results: { basePriceCents: number }[] };
    return r.results.map((x) => x.basePriceCents);
  },
};
