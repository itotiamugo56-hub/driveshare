import { create } from 'zustand';

export type AppRole = 'user' | 'support_agent' | 'arbitrator' | 'admin' | 'service';

interface AuthState {
  baseUrl: string;
  accessToken: string | null;
  userId: string | null;
  role: AppRole | null;
  setBaseUrl: (url: string) => void;
  setSession: (session: { accessToken: string; userId: string; role: AppRole }) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  baseUrl: `http://${window.location.hostname}:3000/api/v1`,
  accessToken: null,
  userId: null,
  role: null,
  setBaseUrl: (url) => set({ baseUrl: url }),
  setSession: (session) =>
    set({ accessToken: session.accessToken, userId: session.userId, role: session.role }),
  logout: () => set({ accessToken: null, userId: null, role: null }),
}));
