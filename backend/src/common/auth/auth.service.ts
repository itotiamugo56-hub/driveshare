import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppRole } from '../enums';

const DAY_MS = 24 * 60 * 60 * 1000;

/** "30d", "12h", "45m" to milliseconds. Falls back to 30 days. */
export function ttlToMs(ttl: string | undefined, fallbackMs = 30 * DAY_MS): number {
  const m = /^(\d+)\s*([smhd])$/.exec((ttl ?? '').trim());
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  return n * { s: 1000, m: 60_000, h: 3_600_000, d: DAY_MS }[m[2] as 's' | 'm' | 'h' | 'd'];
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires, so clients never need to decode the JWT. */
  expiresIn: number;
  userId: string;
  role: string;
}

/**
 * Account creation, login, and session lifetime.
 *
 * Sessions are a short-lived access JWT plus a rotating, opaque refresh token. Only a
 * hash of the refresh token is stored. Every refresh issues a new token and retires the
 * old one; presenting a retired token revokes the whole family (theft signal).
 */
@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private config: ConfigService) {}

  async register(email: string, password: string, role: AppRole = AppRole.USER, userAgent?: string) {
    const passwordHash = await bcrypt.hash(password, 10);
    let user;
    try {
      user = await this.prisma.user.create({
        data: { email, passwordHash, role: role as any },
      });
    } catch (err) {
      // Duplicate email is a client error (409), not a server fault.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('An account with this email already exists');
      }
      throw err;
    }
    await this.prisma.trustScore.create({
      data: { userId: user.id, overallScore: 300, tier: 'new', factorBreakdown: {} },
    });
    return this.issueSession(user.id, user.role, user.email, randomUUID(), userAgent);
  }

  async login(email: string, password: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    return this.issueSession(user.id, user.role, user.email, randomUUID(), userAgent);
  }

  /** Exchange a refresh token for a new pair. The presented token is retired. */
  async refresh(refreshToken: string, userAgent?: string): Promise<TokenPair> {
    if (!refreshToken) throw new UnauthorizedException('Invalid session');
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
    if (!row) throw new UnauthorizedException('Invalid session');

    if (row.revokedAt) {
      // A retired token came back: someone else holds a copy. Kill the whole family.
      await this.prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException('Session ended. Please sign in again.');
    }
    if (row.expiresAt.getTime() <= Date.now()) throw new UnauthorizedException('Session expired. Please sign in again.');

    const user = await this.prisma.user.findUnique({ where: { id: row.userId } });
    if (!user) throw new UnauthorizedException('Invalid session');

    const next = await this.issueSession(user.id, user.role, user.email, row.familyId, userAgent);
    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date(), replacedBy: hashToken(next.refreshToken) },
    });
    return next;
  }

  /** Revoke the session family the token belongs to. Always succeeds, so logout never fails visibly. */
  async logout(refreshToken?: string) {
    if (!refreshToken) return { ok: true };
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
    if (row) {
      await this.prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    return { ok: true };
  }

  /** Sign out of every device. */
  async logoutAll(userId: string) {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Invalid session');
    return { userId: user.id, email: user.email, role: user.role };
  }

  private async issueSession(sub: string, role: string, email: string, familyId: string, userAgent?: string): Promise<TokenPair> {
    const accessToken = this.jwt.sign({ sub, role, email });
    const refreshToken = randomBytes(48).toString('base64url');
    const ttlMs = ttlToMs(this.config.get<string>('JWT_REFRESH_TTL'));
    await this.prisma.refreshToken.create({
      data: { userId: sub, familyId, tokenHash: hashToken(refreshToken), expiresAt: new Date(Date.now() + ttlMs), userAgent: userAgent?.slice(0, 255) },
    });
    const expiresIn = Math.floor(ttlToMs(this.config.get<string>('JWT_ACCESS_TTL'), 15 * 60_000) / 1000);
    return { accessToken, refreshToken, expiresIn, userId: sub, role };
  }
}
