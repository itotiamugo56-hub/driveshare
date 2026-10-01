import { request } from '../client';

export interface TripPreviewInput { listingId: string; startDate: string; endDate: string; coverageTierId: string; includeDelivery?: boolean }
export interface TripPreview {
  days: number; currency: string; rentalCents: number; dailyCoverCents: number; coverCents: number; deliveryCents: number;
  totalCents: number; depositCents: number; instantBook: boolean; freeCancellationUntil: string;
  eligibility: { eligible: boolean; reason: string | null };
}
export interface Trip {
  id: string; listingId: string; vehicleId: string; renterId: string; ownerId: string; startDate: string; endDate: string; days: number;
  currency: string; rentalCents: number; coverCents: number; deliveryCents: number; totalCents: number; depositCents: number;
  status: 'requested' | 'confirmed' | 'cancelled'; role?: 'renter' | 'owner' | 'staff'; renterTier?: string | null; createdAt: string;
}

export const tripsApi = {
  preview: (d: TripPreviewInput, token?: string | null) => request({ method: 'POST', url: '/trips/preview', data: d, token }) as Promise<TripPreview>,
  book: (d: TripPreviewInput & { paymentMethodId: string; comprehensionAnswers: { questionId: string; answer: string }[] }, token?: string | null) =>
    request({ method: 'POST', url: '/trips', data: d, token }) as Promise<Trip>,
  mine: (token?: string | null) => request({ method: 'GET', url: '/trips/mine', token }) as Promise<Trip[]>,
  get: (id: string, token?: string | null) => request({ method: 'GET', url: `/trips/${id}`, token }) as Promise<Trip>,
  respond: (id: string, accept: boolean, token?: string | null) => request({ method: 'POST', url: `/trips/${id}/respond`, data: { accept }, token }) as Promise<Trip>,
  cancel: (id: string, token?: string | null) => request({ method: 'POST', url: `/trips/${id}/cancel`, token }) as Promise<Trip>,
};
