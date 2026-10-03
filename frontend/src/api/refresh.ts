import axios from 'axios';
import { useAuthStore, accessTokenStale } from '../store/authStore';

/**
 * ok       the session was renewed (here or by another tab)
 * invalid  the server says the session is over (expired, revoked, reuse detected)
 * network  could not reach the server; the session is kept and retried later
 */
export type RefreshOutcome = 'ok' | 'invalid' | 'network';

let inflight: Promise<RefreshOutcome> | null = null;

/** Single-flight: any number of callers share one refresh request. */
export function refreshSession(): Promise<RefreshOutcome> {
  inflight ??= withCrossTabLock(doRefresh).finally(() => { inflight = null; });
  return inflight;
}

/**
 * Refresh tokens rotate, so two tabs refreshing with the same token would trip reuse detection and sign the
 * user out everywhere. A Web Lock serialises tabs; the second tab finds a fresh session in storage and skips.
 */
async function withCrossTabLock(fn: () => Promise<RefreshOutcome>): Promise<RefreshOutcome> {
  const locks = (typeof navigator !== 'undefined' ? navigator.locks : undefined) as LockManager | undefined;
  if (!locks) return fn();
  return locks.request('ds-session-refresh', fn);
}

async function doRefresh(): Promise<RefreshOutcome> {
  const before = useAuthStore.getState();
  // Another tab may have refreshed while we waited for the lock.
  await useAuthStore.persist.rehydrate();
  const now = useAuthStore.getState();
  if (!now.userId || !now.refreshToken) return now.accessToken ? 'ok' : 'invalid';
  if (now.refreshToken !== before.refreshToken && !accessTokenStale(now)) return 'ok';

  try {
    const { data } = await axios.post(`${now.baseUrl}/auth/refresh`, { refreshToken: now.refreshToken }, { timeout: 15_000 });
    useAuthStore.getState().setSession({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresIn ? Date.now() + data.expiresIn * 1000 : null,
      userId: data.userId,
      role: data.role,
    });
    return 'ok';
  } catch (e) {
    const status = axios.isAxiosError(e) ? e.response?.status : undefined;
    // A definite "no" from the server ends the session. Offline, timeouts and 5xx never do.
    if (status === 400 || status === 401 || status === 403) return 'invalid';
    return 'network';
  }
}
