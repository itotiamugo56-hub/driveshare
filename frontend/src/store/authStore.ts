import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

export type AppRole = 'user' | 'support_agent' | 'arbitrator' | 'admin' | 'service';

export interface SessionData {
  accessToken: string;
  userId: string;
  role: AppRole;
  /** Rotating, opaque token that renews the session. Absent only for sessions minted by older backends. */
  refreshToken?: string | null;
  /** Epoch ms when the access token stops being accepted. */
  expiresAt?: number | null;
}

interface AuthState {
  baseUrl: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  userId: string | null;
  role: AppRole | null;
  setBaseUrl: (url: string) => void;
  setSession: (session: SessionData) => void;
  /** Drops the session from memory and storage. Network revocation and cache cleanup live in `endSession` (lib/session.ts). */
  clearSession: () => void;
  /** @deprecated kept so existing callers keep working; use `endSession('logout')` from the UI. */
  logout: () => void;
}

/** localStorage that never throws (private mode, quota, disabled storage). A failed write just means no persistence. */
const safeStorage: StateStorage = {
  getItem: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  setItem: (k, v) => { try { localStorage.setItem(k, v); } catch { /* session stays in memory */ } },
  removeItem: (k) => { try { localStorage.removeItem(k); } catch { /* nothing to remove */ } },
};

export const SESSION_KEY = 'ds-session';

const EMPTY = { accessToken: null, refreshToken: null, expiresAt: null, userId: null, role: null } as const;

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      baseUrl: import.meta.env.VITE_API_URL ?? `http://${window.location.hostname}:3000/api/v1`,
      ...EMPTY,
      setBaseUrl: (url) => set({ baseUrl: url }),
      setSession: (s) =>
        set({ accessToken: s.accessToken, userId: s.userId, role: s.role, refreshToken: s.refreshToken ?? null, expiresAt: s.expiresAt ?? null }),
      clearSession: () => set({ ...EMPTY }),
      logout: () => set({ ...EMPTY }),
    }),
    {
      name: SESSION_KEY,
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      // Only the session is persisted. baseUrl is editable in the dev dashboard and must not stick.
      partialize: (s) => ({ accessToken: s.accessToken, refreshToken: s.refreshToken, expiresAt: s.expiresAt, userId: s.userId, role: s.role }),
    },
  ),
);

/** True when the access token is missing or within `skewMs` of expiring. */
export const accessTokenStale = (s: Pick<AuthState, 'expiresAt' | 'accessToken'>, skewMs = 20_000) =>
  !s.accessToken || (s.expiresAt != null && s.expiresAt - skewMs <= Date.now());
