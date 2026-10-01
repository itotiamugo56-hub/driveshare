import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppRole } from '../enums';

/**
 * Not an explicit "service domain" in the architecture spec, but required
 * ([INFERRED]) so every other service's bearer-JWT auth requirement is
 * actually satisfiable end-to-end (account creation + login + token issuance).
 */
@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async register(email: string, password: string, role: AppRole = AppRole.USER) {
    const passwordHash = await bcrypt.hash(password, 10);
    let user;
    try {
      user = await this.prisma.user.create({
        data: { email, passwordHash, role: role as any },
      });
    } catch (err) {
      // Prisma's unique-constraint violation (duplicate email) was previously
      // propagating unhandled to Nest's default filter as a 500. An email
      // collision is a client error (the resource already exists), not a
      // server fault, so it belongs on a 409 — this is the fix for the
      // duplicate-email registration bug flagged after the smoke test run.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('An account with this email already exists');
      }
      throw err;
    }
    await this.prisma.trustScore.create({
      data: { userId: user.id, overallScore: 300, tier: 'new', factorBreakdown: {} },
    });
    return this.issueTokens(user.id, user.role, user.email);
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    return this.issueTokens(user.id, user.role, user.email);
  }

  private issueTokens(sub: string, role: string, email: string) {
    const accessToken = this.jwt.sign({ sub, role, email });
    return { accessToken, userId: sub, role };
  }
}