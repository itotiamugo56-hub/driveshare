import { request } from '../client';

export const disputeApi = {
  file: (tripId: string, disputeType: string, token?: string | null) =>
    request({ method: 'POST', url: '/disputes', data: { tripId, disputeType }, token }),

  get: (disputeId: string, token?: string | null) =>
    request({ method: 'GET', url: `/disputes/${disputeId}`, token }),

  addEvidence: (disputeId: string, sourceType: string, refPointer: string, token?: string | null) =>
    request({ method: 'POST', url: `/disputes/${disputeId}/evidence`, data: { sourceType, refPointer }, token }),

  autoResolveAttempt: (disputeId: string, token?: string | null) =>
    request({ method: 'POST', url: `/disputes/${disputeId}/auto-resolve-attempt`, token }),

  escalate: (disputeId: string, token?: string | null) =>
    request({ method: 'POST', url: `/disputes/${disputeId}/escalate`, token }),

  mediatorDecision: (
    disputeId: string,
    decisionSummary: string,
    resolutionOutcome: string,
    token?: string | null,
  ) => request({ method: 'POST', url: `/disputes/${disputeId}/mediator-decision`, data: { decisionSummary, resolutionOutcome }, token }),

  arbitrationHandoff: (disputeId: string, token?: string | null) =>
    request({ method: 'POST', url: `/disputes/${disputeId}/arbitration-handoff`, token }),

  getTimeline: (disputeId: string, token?: string | null) =>
    request({ method: 'GET', url: `/disputes/${disputeId}/timeline`, token }),
};
