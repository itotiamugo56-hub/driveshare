import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { useAuthStore, accessTokenStale } from '../store/authStore';
import { refreshSession } from './refresh';

/** Broadcast when the server ends the session on its own (expired, revoked). The app shell reacts by cleaning up and routing to sign-in. */
export const SESSION_ENDED_EVENT = 'ds:session-ended';
const isAuthUrl = (url?: string) => !!url && /\/auth\//.test(url);

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

client.interceptors.request.use(async (config) => {
  // Renew a token that is about to expire before sending, so the person never sees a 401 round trip.
  const pre = useAuthStore.getState();
  if (pre.refreshToken && !isAuthUrl(config.url) && accessTokenStale(pre) && pre.userId) await refreshSession();
  const { accessToken, baseUrl } = useAuthStore.getState();
  config.baseURL = baseUrl;
  if (accessToken && !config.headers?.['X-Skip-Auth']) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

type Retriable = AxiosRequestConfig & { _retried?: boolean };

client.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (axios.isAxiosError(err) && err.response?.status === 401 && err.config) {
      const cfg = err.config as Retriable;
      const { refreshToken, userId } = useAuthStore.getState();
      if (refreshToken && userId && !cfg._retried && !isAuthUrl(cfg.url)) {
        const outcome = await refreshSession();
        if (outcome === 'ok') {
          cfg._retried = true;
          // The request interceptor stamps the renewed token on the retry.
          return client.request(cfg);
        }
        if (outcome === 'invalid') {
          useAuthStore.getState().clearSession();
          window.dispatchEvent(new CustomEvent(SESSION_ENDED_EVENT, { detail: 'expired' }));
        }
        // 'network': keep the session; the caller sees the original error and can retry.
      }
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
