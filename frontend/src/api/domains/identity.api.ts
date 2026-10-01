import { request } from '../client';

export const identityApi = {
  initiateVerification: (documentType: string, token?: string | null) =>
    request({ method: 'POST', url: '/identity/verifications', data: { documentType }, token }),

  uploadDocument: (verificationId: string, documentBase64: string, token?: string | null) =>
    request({ method: 'POST', url: `/identity/verifications/${verificationId}/documents`, data: { documentBase64 }, token }),

  submitLiveness: (verificationId: string, livenessMediaBase64: string, token?: string | null) =>
    request({ method: 'POST', url: `/identity/verifications/${verificationId}/liveness`, data: { livenessMediaBase64 }, token }),

  getVerification: (verificationId: string, token?: string | null) =>
    request({ method: 'GET', url: `/identity/verifications/${verificationId}`, token }),

  submitLicense: (body: { licenseNumber: string; issuingRegion: string; licenseClass: string; expirationDate: string }, token?: string | null) =>
    request({ method: 'POST', url: '/identity/licenses', data: body, token }),

  getLicenseStatus: (licenseId: string, token?: string | null) =>
    request({ method: 'GET', url: `/identity/licenses/${licenseId}/status`, token }),

  requestDrivingHistory: (consentGiven: boolean, token?: string | null) =>
    request({ method: 'POST', url: '/identity/driving-history', data: { consentGiven }, token }),

  getDrivingHistory: (requestId: string, token?: string | null) =>
    request({ method: 'GET', url: `/identity/driving-history/${requestId}`, token }),

  scheduleReverification: (userId: string, token?: string | null) =>
    request({ method: 'POST', url: '/identity/reverifications/schedule', data: { userId }, token }),

  getConsolidatedStatus: (userId: string, token?: string | null) =>
    request({ method: 'GET', url: `/identity/users/${userId}/status`, token }),

  handleVendorCallback: (
    payload: { verificationId: string; status: 'approved' | 'rejected'; reason?: string },
    token?: string | null,
  ) => request({ method: 'POST', url: '/identity/webhooks/vendor-callback', data: payload, token }),
};
