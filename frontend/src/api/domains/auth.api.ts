import { request } from '../client';
import { AppRole, type SessionData } from '../../store/authStore';

export interface LoginResponse {
  accessToken: string;
  refreshToken?: string;
  /** Seconds until the access token expires. */
  expiresIn?: number;
  userId: string;
  role: AppRole;
}

/** Turns a login/register/refresh response into the shape the auth store keeps. */
export const toSession = (r: LoginResponse): SessionData => ({
  accessToken: r.accessToken,
  refreshToken: r.refreshToken ?? null,
  expiresAt: r.expiresIn ? Date.now() + r.expiresIn * 1000 : null,
  userId: r.userId,
  role: r.role,
});

export const authApi = {
  register: (email: string, password: string) =>
    request<LoginResponse>({ method: 'POST', url: '/auth/register', data: { email, password }, token: null }),

  login: (email: string, password: string) =>
    request<LoginResponse>({ method: 'POST', url: '/auth/login', data: { email, password }, token: null }),

  /** Revokes the session on the server. Safe to call with an unknown or missing token. */
  logout: (refreshToken?: string | null) =>
    request<{ ok: boolean }>({ method: 'POST', url: '/auth/logout', data: { refreshToken: refreshToken ?? undefined }, token: null }),

  me: () => request<{ userId: string; email: string; role: AppRole }>({ method: 'GET', url: '/auth/me' }),
};
