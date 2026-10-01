import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EventBusService } from '../../../common/event-bus/event-bus.service';
import { EVT, AppRole, StaffCapability } from '../../../common/enums';
import { AdminAuditService } from '../admin-audit.service';

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService, private events: EventBusService, private audit: AdminAuditService) {}

  /** Only an existing admin with MANAGE_STAFF may create new staff accounts. */
  async createStaffAccount(actorId: string, email: string, password: string, role: AppRole) {
    if (role === AppRole.USER) throw new BadRequestException('Use /auth/register for ordinary customer accounts');
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({ data: { email, passwordHash, role: role as any } });
    await this.audit.log(actorId, 'admin', 'create_staff_account', 'user', user.id, `Created ${role} account`);
    return { id: user.id, email: user.email, role: user.role };
  }

  async listStaff() {
    return this.prisma.user.findMany({
      where: { role: { in: ['admin', 'support_agent', 'arbitrator'] } },
      select: { id: true, email: true, role: true, createdAt: true },
    });
  }

  async getPermissions(userId: string) {
    return this.prisma.staffPermission.findMany({ where: { userId, revokedAt: null } });
  }

  async grantCapability(actorId: string, userId: string, capability: StaffCapability) {
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException('User not found');
    if (!['admin', 'support_agent', 'arbitrator'].includes(target.role)) {
      throw new BadRequestException('Capabilities can only be granted to staff-role accounts (admin/support_agent/arbitrator)');
    }
    const grant = await this.prisma.staffPermission.upsert({
      where: { userId_capability: { userId, capability: capability as any } },
      update: { revokedAt: null, revokedBy: null, grantedBy: actorId, grantedAt: new Date() },
      create: { userId, capability: capability as any, grantedBy: actorId },
    });
    await this.audit.log(actorId, 'admin', 'grant_capability', 'staff_permission', grant.id, `Granted ${capability}`);
    this.events.publish(EVT.ADMIN_STAFF_PERMISSION_GRANTED, { userId, capability });
    return grant;
  }

  async revokeCapability(actorId: string, userId: string, capability: StaffCapability, reason: string) {
    const grant = await this.prisma.staffPermission.findUnique({ where: { userId_capability: { userId, capability: capability as any } } });
    if (!grant) throw new NotFoundException('No such active grant');
    const updated = await this.prisma.staffPermission.update({
      where: { userId_capability: { userId, capability: capability as any } },
      data: { revokedAt: new Date(), revokedBy: actorId },
    });
    await this.audit.log(actorId, 'admin', 'revoke_capability', 'staff_permission', grant.id, reason);
    this.events.publish(EVT.ADMIN_STAFF_PERMISSION_REVOKED, { userId, capability, reason });
    return updated;
  }

  /**
   * Support-view impersonation: read access to a user's account for debugging,
   * never write access, and always time-bounded + reason-logged. Distinct from
   * silently "logging in as" a user.
   */
  async startImpersonation(staffId: string, targetUserId: string, reason: string) {
    if (!reason || reason.trim().length < 10) {
      throw new BadRequestException('A substantive reason is required to start an impersonation/support-view session');
    }
    const session = await this.prisma.impersonationSession.create({
      data: { staffId, targetUserId, reason },
    });
    await this.audit.log(staffId, 'support_agent', 'start_impersonation', 'user', targetUserId, reason);
    this.events.publish(EVT.ADMIN_IMPERSONATION_STARTED, { staffId, targetUserId });
    return session;
  }

  async endImpersonation(sessionId: string, staffId: string) {
    const session = await this.prisma.impersonationSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Impersonation session not found');
    if (session.staffId !== staffId) throw new ForbiddenException('Only the initiating staff member may end this session');
    const updated = await this.prisma.impersonationSession.update({ where: { id: sessionId }, data: { endedAt: new Date() } });
    this.events.publish(EVT.ADMIN_IMPERSONATION_ENDED, { staffId, targetUserId: session.targetUserId });
    return updated;
  }

  async listImpersonationSessions(filters: { staffId?: string; targetUserId?: string }) {
    return this.prisma.impersonationSession.findMany({ where: filters, orderBy: { startedAt: 'desc' }, take: 200 });
  }
}
