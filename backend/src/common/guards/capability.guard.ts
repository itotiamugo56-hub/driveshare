import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { CAPABILITY_KEY } from '../decorators/require-capability.decorator';
import { StaffCapability } from '../enums';

@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<StaffCapability[]>(CAPABILITY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new ForbiddenException('Not authenticated');

    const grants = await this.prisma.staffPermission.findMany({
      where: { userId: user.userId, capability: { in: required as any }, revokedAt: null },
    });
    const grantedCapabilities = new Set(grants.map((g) => g.capability));
    const missing = required.filter((c) => !grantedCapabilities.has(c as any));

    if (missing.length > 0) {
      throw new ForbiddenException(`Missing required capability grant(s): ${missing.join(', ')}`);
    }
    return true;
  }
}
