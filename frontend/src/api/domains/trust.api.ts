import { request } from '../client';

export const trustApi = {
  getScore: (userId: string, token?: string | null) =>
    request({ method: 'GET', url: `/trust/users/${userId}/score`, token }),

  recalculate: (userId: string, token?: string | null) =>
    request({ method: 'POST', url: `/trust/users/${userId}/recalculate`, token }),

  importExternalHistory: (sourcePlatform: string, verificationMethod: string, token?: string | null) =>
    request({ method: 'POST', url: '/trust/imports/external-history', data: { sourcePlatform, verificationMethod }, token }),

  getImportStatus: (importId: string, token?: string | null) =>
    request({ method: 'GET', url: `/trust/imports/${importId}/status`, token }),

  getThreshold: (listingId: string, token?: string | null) =>
    request({ method: 'GET', url: `/trust/thresholds/${listingId}`, token }),

  setThreshold: (listingId: string, minimumScore: number, minimumTier: string, token?: string | null) =>
    request({ method: 'PUT', url: `/trust/thresholds/${listingId}`, data: { minimumScore, minimumTier }, token }),

  checkEligibility: (userId: string, listingId: string, token?: string | null) =>
    request({ method: 'POST', url: '/trust/eligibility-check', data: { userId, listingId }, token }),
};
