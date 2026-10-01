import { request } from '../client';

export const fraudApi = {
  evaluateBooking: (
    userId: string,
    listingId: string,
    tripId: string,
    context: Record<string, unknown> | undefined,
    token?: string | null,
  ) => request({ method: 'POST', url: '/fraud/evaluate/booking', data: { userId, listingId, tripId, context }, token }),

  evaluateListing: (listingId: string, ownerId: string, token?: string | null) =>
    request({ method: 'POST', url: '/fraud/evaluate/listing', data: { listingId, ownerId }, token }),

  submitDeviceSignal: (
    userId: string,
    deviceFingerprint: string,
    behavioralBiometricScore: number,
    ipGeoMismatchFlag: boolean,
    token?: string | null,
  ) =>
    request({
      method: 'POST',
      url: '/fraud/signals/device',
      data: { userId, deviceFingerprint, behavioralBiometricScore, ipGeoMismatchFlag },
      token,
    }),

  getCase: (caseId: string, token?: string | null) =>
    request({ method: 'GET', url: `/fraud/cases/${caseId}`, token }),

  decideCase: (caseId: string, status: string, token?: string | null) =>
    request({ method: 'POST', url: `/fraud/cases/${caseId}/decision`, data: { status }, token }),

  assembleChargebackEvidence: (tripId: string, includedArtifacts: string[], token?: string | null) =>
    request({ method: 'POST', url: '/fraud/chargeback-evidence', data: { tripId, includedArtifacts }, token }),

  getChargebackBundle: (bundleId: string, token?: string | null) =>
    request({ method: 'GET', url: `/fraud/chargeback-evidence/${bundleId}`, token }),

  linkAnalysis: (userIds: string[], token?: string | null) =>
    request({ method: 'POST', url: '/fraud/link-analysis', data: { userIds }, token }),
};
