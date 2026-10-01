import { request } from '../client';

export const pricingApi = {
  getSuggestion: (listingId: string, region: string, token?: string | null) =>
    request({ method: 'POST', url: '/pricing/suggestions', data: { listingId, region }, token }),

  getComparables: (region: string, vehicleClass: string | undefined, token?: string | null) =>
    request({ method: 'GET', url: '/pricing/comparables', params: { region, vehicleClass }, token }),

  getEarningsBreakdown: (tripId: string, grossTripPriceCents: number, token?: string | null) =>
    request({ method: 'POST', url: '/pricing/earnings-breakdown', data: { tripId, grossTripPriceCents }, token }),

  getIdleRecommendations: (ownerId: string, token?: string | null) =>
    request({ method: 'GET', url: `/pricing/idle-recommendations/${ownerId}`, token }),

  getCancellationRisk: (tripId: string, token?: string | null) =>
    request({ method: 'GET', url: `/pricing/cancellation-risk/${tripId}`, token }),

  setSurgeCap: (marketRegion: string, maxMultiplierBasisPoints: number, token?: string | null) =>
    request({ method: 'POST', url: '/pricing/surge-caps', data: { marketRegion, maxMultiplierBasisPoints }, token }),
};
