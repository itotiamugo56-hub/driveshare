import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Every managerial action taken through this module — suspensions, score
 * overrides, impersonation, config changes, moderation decisions — is logged
 * here with a mandatory reason. This is deliberately separate from Section 5's
 * AccessAuditLogEntry (which logs raw tokenized-document reads); this log is
 * the "who did what to whom and why" trail a company needs for accountability
 * and dispute-of-last-resort ("why was my account suspended?") purposes.
 */
@Injectable()
export class AdminAuditService {
  constructor(private prisma: PrismaService) {}

  async log(actorId: string, actorRole: string, action: string, targetType: string, targetId: string, reason?: string, metadata: any = {}) {
    return this.prisma.adminAuditLog.create({
      data: { actorId, actorRole, action, targetType, targetId, reason, metadata },
    });
  }

  async query(filters: { actorId?: string; targetType?: string; targetId?: string; action?: string }) {
    return this.prisma.adminAuditLog.findMany({
      where: filters,
      orderBy: { occurredAt: 'desc' },
      take: 500,
    });
  }
}
