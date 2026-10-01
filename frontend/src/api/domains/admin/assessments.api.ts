import { request } from '../../client';

export const adminAssessmentsApi = {
  userRisk: (token?: string | null) => request({ method: 'GET', url: '/admin/assessments/user-risk', token }),

  vehicleQuality: (vehicleId: string, token?: string | null) =>
    request({ method: 'GET', url: `/admin/assessments/vehicle-quality/${vehicleId}`, token }),

  performanceScorecard: (userId: string, token?: string | null) =>
    request({ method: 'GET', url: `/admin/assessments/performance-scorecard/${userId}`, token }),

  financialHealth: (token?: string | null) =>
    request({ method: 'GET', url: '/admin/assessments/financial-health', token }),

  regionalMarket: (token?: string | null) =>
    request({ method: 'GET', url: '/admin/assessments/regional-market', token }),

  compliance: (token?: string | null) => request({ method: 'GET', url: '/admin/assessments/compliance', token }),

  vendorIntegrations: (token?: string | null) =>
    request({ method: 'GET', url: '/admin/assessments/vendor-integrations', token }),
};
