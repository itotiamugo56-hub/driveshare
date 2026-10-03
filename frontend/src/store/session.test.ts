import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { useAuthStore, SESSION_KEY, accessTokenStale } from './authStore';
import { useAppStore } from './appStore';
import { queryClient } from '../api/queryClient';
import { endSession, bootSession } from '../lib/session';
import { refreshSession } from '../api/refresh';

vi.mock('axios', async (orig) => {
  const real = await orig<typeof import('axios')>();
  return { ...real, default: { ...real.default, post: vi.fn(), isAxiosError: real.default.isAxiosError, create: real.default.create } };
});
const post = axios.post as unknown as ReturnType<typeof vi.fn>;
const signIn = (extra: object = {}) => useAuthStore.getState().setSession({ accessToken: 'a1', refreshToken: 'r1', userId: 'u1', role: 'user', expiresAt: Date.now() + 600_000, ...extra });

beforeEach(() => { localStorage.clear(); useAuthStore.getState().clearSession(); useAppStore.setState({ onboarded: true, sessionNotice: null }); queryClient.clear(); post.mockReset(); });

describe('session persistence', () => {
  it('writes the session to storage so a relaunch finds it', () => {
    signIn();
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY)!).state;
    expect(saved).toMatchObject({ userId: 'u1', accessToken: 'a1', refreshToken: 'r1' });
    expect(saved.baseUrl).toBeUndefined();
  });
  it('restores the session from storage after a relaunch', async () => {
    // Simulate a fresh launch: storage holds a session, memory is empty.
    localStorage.setItem(SESSION_KEY, JSON.stringify({ state: { userId: 'u1', accessToken: 'a1', refreshToken: 'r1', expiresAt: null, role: 'user' }, version: 1 }));
    useAuthStore.getState().clearSession(); localStorage.setItem(SESSION_KEY, JSON.stringify({ state: { userId: 'u1', accessToken: 'a1', refreshToken: 'r1', expiresAt: null, role: 'user' }, version: 1 }));
    await useAuthStore.persist.rehydrate();
    expect(useAuthStore.getState()).toMatchObject({ userId: 'u1', refreshToken: 'r1' });
  });
  it('knows when the access token is stale', () => {
    expect(accessTokenStale({ accessToken: 'x', expiresAt: Date.now() + 600_000 })).toBe(false);
    expect(accessTokenStale({ accessToken: 'x', expiresAt: Date.now() + 5_000 })).toBe(true);
    expect(accessTokenStale({ accessToken: null, expiresAt: null })).toBe(true);
  });
});

describe('refreshing', () => {
  it('shares one request between simultaneous callers and stores the rotated tokens', async () => {
    signIn({ expiresAt: Date.now() - 1 });
    post.mockResolvedValue({ data: { accessToken: 'a2', refreshToken: 'r2', expiresIn: 900, userId: 'u1', role: 'user' } });
    const [x, y] = await Promise.all([refreshSession(), refreshSession()]);
    expect([x, y]).toEqual(['ok', 'ok']);
    expect(post).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({ accessToken: 'a2', refreshToken: 'r2' });
  });
  it('an explicit rejection ends the session; a network failure keeps it', async () => {
    signIn({ expiresAt: Date.now() - 1 });
    post.mockRejectedValue(Object.assign(new Error('x'), { isAxiosError: true, response: { status: 401 } }));
    expect(await refreshSession()).toBe('invalid');
    post.mockRejectedValue(Object.assign(new Error('x'), { isAxiosError: true, response: undefined }));
    expect(await refreshSession()).toBe('network');
    expect(useAuthStore.getState().userId).toBe('u1');
  });
  it('boot renews a stale token, but never blocks or signs out when offline', async () => {
    signIn({ expiresAt: Date.now() - 1 });
    post.mockResolvedValue({ data: { accessToken: 'a9', refreshToken: 'r9', expiresIn: 900, userId: 'u1', role: 'user' } });
    await bootSession();
    expect(useAuthStore.getState().accessToken).toBe('a9');

    signIn({ expiresAt: Date.now() - 1 }); post.mockClear();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await bootSession();
    expect(post).not.toHaveBeenCalled();
    expect(useAuthStore.getState().userId).toBe('u1');
    vi.restoreAllMocks();
  });
  it('boot ends a session the server has revoked and leaves a notice', async () => {
    signIn({ expiresAt: Date.now() - 1 });
    post.mockRejectedValue(Object.assign(new Error('x'), { isAxiosError: true, response: { status: 401 } }));
    await bootSession();
    expect(useAuthStore.getState().userId).toBeNull();
    expect(useAppStore.getState().sessionNotice).toBe('expired');
  });
});

describe('endSession', () => {
  it('voluntary sign-out clears everything and brings back the welcome flow', () => {
    signIn(); queryClient.setQueryData(['owner-vehicles', 'u1'], [1]); localStorage.setItem('ds-draft-V', '{}');
    post.mockResolvedValue({ data: { ok: true } });
    endSession('logout');
    expect(useAuthStore.getState()).toMatchObject({ userId: null, accessToken: null, refreshToken: null });
    expect(queryClient.getQueryData(['owner-vehicles', 'u1'])).toBeUndefined();
    expect(localStorage.getItem('ds-draft-V')).toBeNull();
    expect(useAppStore.getState().onboarded).toBe(false);
  });
  it('an expired session keeps onboarding done and explains itself', () => {
    signIn(); endSession('expired');
    expect(useAppStore.getState()).toMatchObject({ onboarded: true, sessionNotice: 'expired' });
  });
});
