import { request } from '../client';

export const insuranceApi = {
  listTiers: (token?: string | null) => request({ method: 'GET', url: '/insurance/tiers', token }),

  getQuote: (tripId: string, tierId: string, riskFactors: Record<string, unknown>, token?: string | null) =>
    request({ method: 'POST', url: '/insurance/quotes', data: { tripId, tierId, riskFactors }, token }),

  bindPolicy: (tripId: string, tierId: string, token?: string | null) =>
    request({ method: 'POST', url: '/insurance/policies', data: { tripId, tierId }, token }),

  getPolicy: (policyId: string, token?: string | null) =>
    request({ method: 'GET', url: `/insurance/policies/${policyId}`, token }),

  submitComprehensionCheck: (tripId: string, answers: Record<string, unknown>, token?: string | null) =>
    request({ method: 'POST', url: '/insurance/comprehension-check', data: { tripId, answers }, token }),

  fileClaim: (policyId: string, tripId: string, claimType: string, token?: string | null) =>
    request({ method: 'POST', url: '/insurance/claims', data: { policyId, tripId, claimType }, token }),

  getClaim: (claimId: string, token?: string | null) =>
    request({ method: 'GET', url: `/insurance/claims/${claimId}`, token }),

  attachEvidence: (claimId: string, evidenceRefs: string[], token?: string | null) =>
    request({ method: 'POST', url: `/insurance/claims/${claimId}/evidence`, data: { evidenceRefs }, token }),

  decideClaim: (claimId: string, status: string, payoutAmountCents: number | undefined, token?: string | null) =>
    request({ method: 'POST', url: `/insurance/claims/${claimId}/decision`, data: { status, payoutAmountCents }, token }),
};
