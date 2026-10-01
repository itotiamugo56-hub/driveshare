import { request } from '../../client';

export const adminReportingApi = {
  revenue: (startDate: string, endDate: string, token?: string | null) =>
    request({ method: 'GET', url: '/admin/reporting/revenue', params: { startDate, endDate }, token }),

  payoutReconciliation: (startDate: string, endDate: string, token?: string | null) =>
    request({ method: 'GET', url: '/admin/reporting/payout-reconciliation', params: { startDate, endDate }, token }),

  ownerEarnings: (ownerId: string, year: string, token?: string | null) =>
    request({ method: 'GET', url: `/admin/reporting/owner-earnings/${ownerId}`, params: { year }, token }),

  insuranceAudit: (tripId: string, token?: string | null) =>
    request({ method: 'GET', url: `/admin/reporting/insurance-pricing-audit/${tripId}`, token }),

  gdprCompliance: (startDate: string, endDate: string, token?: string | null) =>
    request({ method: 'GET', url: '/admin/reporting/gdpr-compliance', params: { startDate, endDate }, token }),

  auditLog: (
    params: { actorId?: string; targetType?: string; targetId?: string; action?: string },
    token?: string | null,
  ) => request({ method: 'GET', url: '/admin/reporting/audit-log', params, token }),
};
