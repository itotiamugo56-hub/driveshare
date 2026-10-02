import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Mode = 'rent' | 'host';

/**
 * Which side of DriveShare the person is using. The header used to guess this from the URL
 * (`/owner...` = host), so any shared page opened from the host area (My profile, Get verified,
 * a trip, the company page) flipped them back to renting. Now the last explicit side is remembered,
 * and only pages that clearly belong to one side change it.
 */
interface ModeState { mode: Mode; setMode: (m: Mode) => void }

export const useModeStore = create<ModeState>()(
  persist((set) => ({ mode: 'rent', setMode: (mode) => set({ mode }) }), { name: 'ds-mode' }),
);

const HOST_PAGES = [/^\/owner(\/|$)/];
const RENT_PAGES = [/^\/$/, /^\/saved\/?$/, /^\/compare\/?$/, /^\/listings(\/|$)/];

/**
 * 'host' / 'rent' when the page belongs to one side; null for shared pages
 * (/users/:id, /verify, /trips, /companies/:id, /login, not-found), which keep whatever side you were on.
 */
export function modeForPath(pathname: string): Mode | null {
  if (HOST_PAGES.some((r) => r.test(pathname))) return 'host';
  if (RENT_PAGES.some((r) => r.test(pathname))) return 'rent';
  return null;
}
