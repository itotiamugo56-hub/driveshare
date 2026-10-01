import { request } from '../../client';

export const adminStaffApi = {
  createAccount: (email: string, password: string, role: string, token?: string | null) =>
    request({ method: 'POST', url: '/admin/staff/accounts', data: { email, password, role }, token }),

  listStaff: (token?: string | null) => request({ method: 'GET', url: '/admin/staff/accounts', token }),

  getPermissions: (userId: string, token?: string | null) =>
    request({ method: 'GET', url: `/admin/staff/accounts/${userId}/permissions`, token }),

  grant: (userId: string, capability: string, token?: string | null) =>
    request({ method: 'POST', url: `/admin/staff/accounts/${userId}/permissions/${capability}`, token }),

  revoke: (userId: string, capability: string, reason: string, token?: string | null) =>
    request({
      method: 'POST',
      url: `/admin/staff/accounts/${userId}/permissions/${capability}/revoke`,
      data: { reason },
      token,
    }),

  startImpersonation: (targetUserId: string, reason: string, token?: string | null) =>
    request({ method: 'POST', url: '/admin/staff/impersonation/start', data: { targetUserId, reason }, token }),

  endImpersonation: (sessionId: string, token?: string | null) =>
    request({ method: 'POST', url: `/admin/staff/impersonation/${sessionId}/end`, token }),

  listImpersonation: (
    params: { staffId?: string; targetUserId?: string },
    token?: string | null,
  ) => request({ method: 'GET', url: '/admin/staff/impersonation', params, token }),
};
