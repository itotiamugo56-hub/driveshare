import { useAuthStore, SESSION_KEY } from '../store/authStore';
import { useAppStore } from '../store/appStore';
import { queryClient } from '../api/queryClient';
import { refreshSession } from '../api/refresh';
import { authApi } from '../api/domains/auth.api';

export type EndReason = 'logout' | 'expired' | 'deleted';

/** Host listing drafts are per-account working copies. Leaving them behind would show one person's draft to the next. */
function clearDrafts() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('ds-draft-')) localStorage.removeItem(k);
  } catch { /* storage unavailable */ }
}

/**
 * The one way a session ends. Revokes it on the server (best effort), clears the token store and every cache that could
 * hold the previous person's data, and decides what the next launch looks like:
 *  - 'logout' / 'deleted': the person chose to leave, so the welcome flow runs again.
 *  - 'expired': the server ended it, so they go straight to sign-in with a short explanation.
 */
export function endSession(reason: EndReason) {
  const { refreshToken } = useAuthStore.getState();
  if (reason !== 'expired' && refreshToken) void authApi.logout(refreshToken).catch(() => undefined);
  useAuthStore.getState().clearSession();
  queryClient.clear();
  clearDrafts();
  if (reason === 'expired') useAppStore.getState().setNotice('expired');
  else useAppStore.getState().resetOnboarding();
}

/**
 * Runs once before the first render. A returning person is already signed in from storage, so the only job here is to
 * renew a token that went stale while the app was closed. It never blocks for long: offline or slow servers keep the
 * stored session and the app opens immediately.
 */
export async function bootSession(timeoutMs = 4000): Promise<void> {
  const s = useAuthStore.getState();
  if (!s.userId || !s.refreshToken) return;
  const stale = !s.accessToken || (s.expiresAt != null && s.expiresAt - 30_000 <= Date.now());
  if (!stale || navigator.onLine === false) return;
  const outcome = await Promise.race([refreshSession(), new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), timeoutMs))]);
  if (outcome === 'invalid') endSession('expired');
}

/** Keeps tabs in step: signing out (or in) in one tab is reflected in the others. */
export function watchOtherTabs() {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== SESSION_KEY) return;
    const hadSession = !!useAuthStore.getState().userId;
    void useAuthStore.persist.rehydrate();
    if (hadSession && !useAuthStore.getState().userId) queryClient.clear();
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
