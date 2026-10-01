import { request } from '../client';

export const securityComplianceApi = {
  tokenizeDocument: (documentClass: string, plaintextBase64: string, token?: string | null) =>
    request({ method: 'POST', url: '/security/documents/tokenize', data: { documentClass, plaintextBase64 }, token }),

  readDocument: (docToken: string, token?: string | null) =>
    request({ method: 'GET', url: `/security/documents/${docToken}`, token }),

  deleteDocument: (docToken: string, token?: string | null) =>
    request({ method: 'DELETE', url: `/security/documents/${docToken}`, token }),

  recordConsent: (
    consentType: string,
    ipAddress: string,
    userAgent: string,
    token?: string | null,
  ) => request({ method: 'POST', url: '/security/consent', data: { consentType, ipAddress, userAgent }, token }),

  listConsents: (userId: string, token?: string | null) =>
    request({ method: 'GET', url: `/security/consent/${userId}`, token }),

  requestExport: (token?: string | null) =>
    request({ method: 'POST', url: '/security/data-requests/export', token }),

  requestDeletion: (token?: string | null) =>
    request({ method: 'POST', url: '/security/data-requests/delete', token }),

  getRequestStatus: (requestId: string, token?: string | null) =>
    request({ method: 'GET', url: `/security/data-requests/${requestId}/status`, token }),

  queryAuditLog: (
    params: { actorId?: string; resourceToken?: string },
    token?: string | null,
  ) => request({ method: 'GET', url: '/security/audit-log', params, token }),
};
