import { request } from '../../client';

export const adminIncidentsApi = {
  create: (
    title: string,
    severity: string,
    description: string,
    affectedServices: string[],
    token?: string | null,
  ) => request({ method: 'POST', url: '/admin/incidents', data: { title, severity, description, affectedServices }, token }),

  list: (status: string | undefined, token?: string | null) =>
    request({ method: 'GET', url: '/admin/incidents', params: { status }, token }),

  get: (id: string, token?: string | null) => request({ method: 'GET', url: `/admin/incidents/${id}`, token }),

  updateStatus: (id: string, status: string, token?: string | null) =>
    request({ method: 'PUT', url: `/admin/incidents/${id}/status`, data: { status }, token }),

  createRule: (
    name: string,
    metric: string,
    comparator: string,
    threshold: number,
    notifyChannel: string,
    token?: string | null,
  ) =>
    request({
      method: 'POST',
      url: '/admin/incidents/alert-rules',
      data: { name, metric, comparator, threshold, notifyChannel },
      token,
    }),

  listRules: (token?: string | null) => request({ method: 'GET', url: '/admin/incidents/alert-rules/list', token }),

  toggleRule: (id: string, enabled: boolean, token?: string | null) =>
    request({ method: 'PUT', url: `/admin/incidents/alert-rules/${id}/toggle`, data: { enabled }, token }),

  evaluate: (metricSnapshot: Record<string, number>, token?: string | null) =>
    request({ method: 'POST', url: '/admin/incidents/alert-rules/evaluate', data: metricSnapshot, token }),

  listFirings: (acknowledged: boolean | undefined, token?: string | null) =>
    request({ method: 'GET', url: '/admin/incidents/alert-firings/list', params: { acknowledged }, token }),

  acknowledge: (id: string, token?: string | null) =>
    request({ method: 'PUT', url: `/admin/incidents/alert-firings/${id}/acknowledge`, token }),
};
