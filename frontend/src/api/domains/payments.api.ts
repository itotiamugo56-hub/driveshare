import { request } from '../client';

export const paymentsApi = {
  addPaymentMethod: (type: string, rawDetails: Record<string, unknown>, token?: string | null) =>
    request({ method: 'POST', url: '/payments/methods', data: { type, rawDetails }, token }),

  listPaymentMethods: (userId: string, token?: string | null) =>
    request({ method: 'GET', url: `/payments/methods/${userId}`, token }),

  removePaymentMethod: (methodId: string, token?: string | null) =>
    request({ method: 'DELETE', url: `/payments/methods/${methodId}`, token }),

  // Fund-movement endpoints below are service-role only — see architecture doc §1.6.
  authorize: (
    tripId: string,
    payerUserId: string,
    paymentMethodId: string,
    amountCents: number,
    currency: string | undefined,
    token?: string | null,
  ) => request({ method: 'POST', url: '/payments/authorizations', data: { tripId, payerUserId, paymentMethodId, amountCents, currency }, token }),

  capture: (authId: string, token?: string | null) =>
    request({ method: 'POST', url: `/payments/authorizations/${authId}/capture`, token }),

  void: (authId: string, token?: string | null) =>
    request({ method: 'POST', url: `/payments/authorizations/${authId}/void`, token }),

  preauthorizeDeposit: (tripId: string, paymentMethodId: string, amountCents: number, token?: string | null) =>
    request({ method: 'POST', url: '/payments/deposits/preauthorize', data: { tripId, paymentMethodId, amountCents }, token }),

  releaseDeposit: (depositId: string, token?: string | null) =>
    request({ method: 'POST', url: `/payments/deposits/${depositId}/release`, token }),

  partialCaptureDeposit: (depositId: string, amountCents: number, reason: string, token?: string | null) =>
    request({ method: 'POST', url: `/payments/deposits/${depositId}/partial-capture`, data: { amountCents, reason }, token }),

  initiatePayout: (ownerId: string, tripId: string, amountCents: number, platformFeeCents: number, token?: string | null) =>
    request({ method: 'POST', url: '/payments/payouts', data: { ownerId, tripId, amountCents, platformFeeCents }, token }),

  getPayout: (payoutId: string, token?: string | null) =>
    request({ method: 'GET', url: `/payments/payouts/${payoutId}`, token }),

  getTripLedger: (tripId: string, token?: string | null) =>
    request({ method: 'GET', url: `/payments/transactions/${tripId}`, token }),

  handleProcessorWebhook: (eventType: string, payload: Record<string, unknown>, token?: string | null) =>
    request({ method: 'POST', url: '/payments/webhooks/processor-callback', data: { eventType, payload }, token }),
};
