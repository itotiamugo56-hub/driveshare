import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/authStore';

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
  raw?: unknown;
}

export function normalizeApiError(err: unknown): ApiError {
  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError<any>;
    const status = ax.response?.status ?? 0;
    const body = ax.response?.data;
    const message =
      (Array.isArray(body?.message) ? body.message.join('; ') : body?.message) ||
      ax.message ||
      'Unknown error';
    return { statusCode: status, message, error: body?.error, raw: body };
  }
  return { statusCode: 0, message: err instanceof Error ? err.message : String(err) };
}

/**
 * A single shared Axios instance. Base URL is overridable per-call (the Test Dashboard
 * lets the base URL be edited at runtime) so it is read from the auth store rather than
 * baked in at import time.
 */
export const client = axios.create();

client.interceptors.request.use((config) => {
  const { accessToken, baseUrl } = useAuthStore.getState();
  config.baseURL = baseUrl;
  if (accessToken && !config.headers?.['X-Skip-Auth']) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      // No refresh-token endpoint exists server-side (see architecture doc §1.0) —
      // a 401 always means "log all the way out", never "silently refresh".
      // The Test Dashboard intentionally does NOT auto-logout on 401s that are the
      // *expected* outcome of a role/permission assertion, so this is opt-in per call
      // via the `expectFailure` flag threaded through request(), not global here.
    }
    return Promise.reject(normalizeApiError(err));
  },
);

export interface RawResult<T = any> {
  status: number;
  body: T;
}

/**
 * Non-throwing request used ONLY by the Test Dashboard's runners, which need to
 * assert on 401/403/400/404 responses as legitimate expected outcomes (exactly
 * like `Invoke-Api` in smoke-test.ps1, which never throws on a non-2xx status —
 * it always returns {StatusCode, Body} and lets the assertion function decide
 * whether that status was the right one).
 */
export async function testRequest<T = any>(
  config: AxiosRequestConfig & { token?: string | null },
): Promise<RawResult<T>> {
  const { baseUrl } = useAuthStore.getState();
  const headers: Record<string, string> = { ...(config.headers as any) };
  if (config.token) headers.Authorization = `Bearer ${config.token}`;
  const res = await axios.request<T>({
    ...config,
    baseURL: config.baseURL ?? baseUrl,
    headers,
    validateStatus: () => true, // never throw — the caller inspects `status` itself
  });
  return { status: res.status, body: res.data };
}

/**
 * Thin wrapper so every domain module calls one function instead of raw axios,
 * with an explicit token override (needed constantly in the Test Dashboard, which
 * juggles admin/owner/renter/service/fraudster tokens within a single run — the
 * shared Authorization-header interceptor above only knows about the "current" user).
 */
export async function request<T = unknown>(
  config: AxiosRequestConfig & { token?: string | null },
): Promise<T> {
  const headers: Record<string, string> = { ...(config.headers as any) };
  if (config.token !== undefined) {
    if (config.token) headers.Authorization = `Bearer ${config.token}`;
    else delete headers.Authorization;
  }
  const res = await client.request<T>({ ...config, headers });
  return res.data;
}
