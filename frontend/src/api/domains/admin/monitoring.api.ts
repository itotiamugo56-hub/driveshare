import { request } from '../../client';

export const adminMonitoringApi = {
  fraud: (token?: string | null) => request({ method: 'GET', url: '/admin/monitoring/fraud', token }),
  disputes: (token?: string | null) => request({ method: 'GET', url: '/admin/monitoring/disputes', token }),
  fleetAccess: (token?: string | null) => request({ method: 'GET', url: '/admin/monitoring/fleet-access', token }),
  payments: (token?: string | null) => request({ method: 'GET', url: '/admin/monitoring/payments', token }),
  insuranceClaims: (token?: string | null) =>
    request({ method: 'GET', url: '/admin/monitoring/insurance-claims', token }),
  systemHealth: (token?: string | null) => request({ method: 'GET', url: '/admin/monitoring/system-health', token }),
  trustTrends: (token?: string | null) => request({ method: 'GET', url: '/admin/monitoring/trust-trends', token }),
};
