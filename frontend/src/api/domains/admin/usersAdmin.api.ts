import { request } from '../../client';

export const adminUsersApi = {
  getProfile: (userId: string, token?: string | null) =>
    request({ method: 'GET', url: `/admin/users/${userId}/profile`, token }),

  suspend: (userId: string, reason: string, token?: string | null) =>
    request({ method: 'POST', url: `/admin/users/${userId}/suspend`, data: { reason }, token }),

  unsuspend: (userId: string, token?: string | null) =>
    request({ method: 'POST', url: `/admin/users/${userId}/unsuspend`, token }),

  forceReverification: (userId: string, token?: string | null) =>
    request({ method: 'POST', url: `/admin/users/${userId}/force-reverification`, token }),

  overrideTrustScore: (userId: string, newScore: number, reason: string, token?: string | null) =>
    request({ method: 'POST', url: `/admin/users/${userId}/trust-score/override`, data: { newScore, reason }, token }),

  suspendVehicle: (vehicleId: string, reason: string, token?: string | null) =>
    request({ method: 'POST', url: `/admin/users/vehicles/${vehicleId}/suspend`, data: { reason }, token }),

  overrideThreshold: (
    listingId: string,
    minimumScore: number,
    minimumTier: string,
    reason: string,
    token?: string | null,
  ) =>
    request({
      method: 'POST',
      url: `/admin/users/listings/${listingId}/threshold-override`,
      data: { minimumScore, minimumTier, reason },
      token,
    }),
};
