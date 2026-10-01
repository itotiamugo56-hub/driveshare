import { request } from '../client';
import { AppRole } from '../../store/authStore';

export interface LoginResponse {
  accessToken: string;
  userId: string;
  role: AppRole;
}

export const authApi = {
  register: (email: string, password: string) =>
    request<LoginResponse>({ method: 'POST', url: '/auth/register', data: { email, password }, token: null }),

  login: (email: string, password: string) =>
    request<LoginResponse>({ method: 'POST', url: '/auth/login', data: { email, password }, token: null }),
};
