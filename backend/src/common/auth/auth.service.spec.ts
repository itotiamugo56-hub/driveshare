import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService, hashToken, ttlToMs } from './auth.service';

/** Minimal in-memory stand-in for the three Prisma delegates AuthService touches. */
function fakePrisma() {
  const tokens: any[] = [];
  const users = [{ id: 'u1', email: 'a@b.co', role: 'user', passwordHash: 'x' }];
  return {
    tokens,
    user: { findUnique: async ({ where }: any) => users.find((u) => u.id === where.id || u.email === where.email) ?? null },
    refreshToken: {
      create: async ({ data }: any) => { const row = { id: `r${tokens.length}`, revokedAt: null, replacedBy: null, ...data }; tokens.push(row); return row; },
      findUnique: async ({ where }: any) => tokens.find((t) => t.tokenHash === where.tokenHash) ?? null,
      update: async ({ where, data }: any) => Object.assign(tokens.find((t) => t.id === where.id), data),
      updateMany: async ({ where, data }: any) => {
        const hit = tokens.filter((t) => (where.familyId ? t.familyId === where.familyId : t.userId === where.userId) && (where.revokedAt === null ? !t.revokedAt : true));
        hit.forEach((t) => Object.assign(t, data));
        return { count: hit.length };
      },
    },
  };
}

function setup() {
  const prisma = fakePrisma();
  const jwt = new JwtService({ secret: 'test' });
  const config = { get: (k: string) => ({ JWT_REFRESH_TTL: '30d', JWT_ACCESS_TTL: '15m' } as Record<string, string>)[k] };
  const svc = new AuthService(prisma as any, jwt, config as any);
  // Bypass bcrypt: start a session directly the way login/register do.
  const start = () => (svc as any).issueSession('u1', 'user', 'a@b.co', 'fam1', 'jest');
  return { svc, prisma, start };
}

describe('AuthService sessions', () => {
  it('stores only a hash of the refresh token', async () => {
    const { prisma, start } = setup();
    const s = await start();
    expect(prisma.tokens[0].tokenHash).toBe(hashToken(s.refreshToken));
    expect(JSON.stringify(prisma.tokens)).not.toContain(s.refreshToken);
    expect(s.expiresIn).toBe(900);
  });

  it('rotates: the old token is retired and a new pair is issued', async () => {
    const { svc, prisma, start } = setup();
    const s1 = await start();
    const s2 = await svc.refresh(s1.refreshToken);
    expect(s2.refreshToken).not.toBe(s1.refreshToken);
    expect(prisma.tokens[0].revokedAt).toBeTruthy();
    expect(prisma.tokens[1].revokedAt).toBeNull();
  });

  it('reuse of a retired token revokes the whole family', async () => {
    const { svc, prisma, start } = setup();
    const s1 = await start();
    const s2 = await svc.refresh(s1.refreshToken);
    await expect(svc.refresh(s1.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.tokens.every((t: any) => t.revokedAt)).toBe(true);
    await expect(svc.refresh(s2.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects unknown and expired tokens', async () => {
    const { svc, prisma, start } = setup();
    await expect(svc.refresh('nope')).rejects.toBeInstanceOf(UnauthorizedException);
    const s = await start();
    prisma.tokens[0].expiresAt = new Date(Date.now() - 1000);
    await expect(svc.refresh(s.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logout revokes the family and never throws for unknown tokens', async () => {
    const { svc, prisma, start } = setup();
    const s = await start();
    await svc.logout(s.refreshToken);
    expect(prisma.tokens[0].revokedAt).toBeTruthy();
    await expect(svc.logout('unknown')).resolves.toEqual({ ok: true });
    await expect(svc.logout(undefined)).resolves.toEqual({ ok: true });
    await expect(svc.refresh(s.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logoutAll ends every device', async () => {
    const { svc, prisma, start } = setup();
    await start(); await start();
    await svc.logoutAll('u1');
    expect(prisma.tokens.every((t: any) => t.revokedAt)).toBe(true);
  });
});

describe('ttlToMs', () => {
  it('parses units and falls back safely', () => {
    expect(ttlToMs('15m')).toBe(900_000);
    expect(ttlToMs('2h')).toBe(7_200_000);
    expect(ttlToMs('30d')).toBe(30 * 86_400_000);
    expect(ttlToMs('garbage', 5)).toBe(5);
    expect(ttlToMs(undefined, 7)).toBe(7);
  });
});
