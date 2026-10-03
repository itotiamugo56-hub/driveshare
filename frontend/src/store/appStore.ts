import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

export type Intent = 'rent' | 'earn' | 'both';
export type Workspace = 'rent' | 'host';
export type SessionNotice = 'expired' | null;

interface AppState {
  /** Has this device finished (or skipped) the welcome flow since the last voluntary sign-out? */
  onboarded: boolean;
  /** What the person said brings them here. Shapes first-run content only; it never grants or removes access. */
  intent: Intent | null;
  /** The area they used last, so a relaunch can reopen it. */
  lastWorkspace: Workspace;
  /** The "earn with your car" card on Explore was dismissed. */
  hostCardDismissed: boolean;
  /** One-shot message shown on the sign-in page after a session ended on its own. Not persisted. */
  sessionNotice: SessionNotice;
  completeOnboarding: (intent?: Intent | null) => void;
  resetOnboarding: () => void;
  setWorkspace: (w: Workspace) => void;
  dismissHostCard: () => void;
  setNotice: (n: SessionNotice) => void;
}

const safeStorage: StateStorage = {
  getItem: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  setItem: (k, v) => { try { localStorage.setItem(k, v); } catch { /* in-memory only */ } },
  removeItem: (k) => { try { localStorage.removeItem(k); } catch { /* nothing to remove */ } },
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      onboarded: false,
      intent: null,
      lastWorkspace: 'rent',
      hostCardDismissed: false,
      sessionNotice: null,
      completeOnboarding: (intent) => set((s) => ({ onboarded: true, intent: intent === undefined ? s.intent : intent })),
      resetOnboarding: () => set({ onboarded: false, intent: null, lastWorkspace: 'rent' }),
      setWorkspace: (lastWorkspace) => set({ lastWorkspace }),
      dismissHostCard: () => set({ hostCardDismissed: true }),
      setNotice: (sessionNotice) => set({ sessionNotice }),
    }),
    {
      name: 'ds-app',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ onboarded: s.onboarded, intent: s.intent, lastWorkspace: s.lastWorkspace, hostCardDismissed: s.hostCardDismissed }),
    },
  ),
);
