import { request } from '../../client';

export const adminConfigApi = {
  listConfig: (token?: string | null) => request({ method: 'GET', url: '/admin/config/settings', token }),

  getConfig: (key: string, token?: string | null) =>
    request({ method: 'GET', url: `/admin/config/settings/${key}`, token }),

  setConfig: (key: string, value: unknown, token?: string | null) =>
    request({ method: 'PUT', url: `/admin/config/settings/${key}`, data: { value }, token }),

  listFlags: (token?: string | null) => request({ method: 'GET', url: '/admin/config/feature-flags', token }),

  getFlag: (key: string, token?: string | null) =>
    request({ method: 'GET', url: `/admin/config/feature-flags/${key}`, token }),

  setFlag: (
    key: string,
    enabled: boolean,
    scopeRegion: string | undefined,
    description: string | undefined,
    token?: string | null,
  ) => request({ method: 'PUT', url: `/admin/config/feature-flags/${key}`, data: { enabled, scopeRegion, description }, token }),

  setSurgeCap: (marketRegion: string, maxMultiplier: number, token?: string | null) =>
    request({ method: 'PUT', url: `/admin/config/surge-caps/${marketRegion}`, data: { maxMultiplier }, token }),
};
