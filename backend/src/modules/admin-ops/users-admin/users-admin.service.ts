import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EventBusService } from '../../../common/event-bus/event-bus.service';
import { EVT } from '../../../common/enums';
import { AdminAuditService } from '../admin-audit.service';

@Injectable()
export class UsersAdminService {
  constructor(private prisma: PrismaService, private events: EventBusService, private audit: AdminAuditService) {}

  /** Consolidated cross-domain profile — the "search/view any user" tool. */
  async getConsolidatedProfile(userId: string) {
    const [user, trust, verification, license, vehicles, disputesFiled, reviewsReceived, fraudCases, activeSuspension] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.trustScore.findUnique({ where: { userId } }),
      this.prisma.verificationSession.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.licenseRecord.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.vehicle.findMany({ where: { ownerId: userId } }),
      this.prisma.disputeCase.count({ where: { filedByUserId: userId } }),
      this.prisma.review.findMany({ where: { subjectUserId: userId, visibility: 'visible' } }),
      this.prisma.fraudCase.count({ where: { relatedUserIds: { has: userId } } }),
      this.prisma.userSuspension.findFirst({ where: { userId, liftedAt: null } }),
    ]);
    if (!user) throw new NotFoundException('User not found');

    return {
      user: { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt },
      trustScore: trust,
      identityVerified: verification?.status === 'approved',
      licenseStatus: license?.dmvValidationStatus ?? 'unknown',
      vehiclesOwned: vehicles.length,
      disputesFiled,
      averageReviewRating: reviewsReceived.length ? reviewsReceived.reduce((s, r) => s + r.rating, 0) / reviewsReceived.length : null,
      fraudCaseCount: fraudCases,
      suspended: !!activeSuspension,
      activeSuspensionReason: activeSuspension?.reason ?? null,
    };
  }

  async suspendUser(actorId: string, userId: string, reason: string) {
    const existing = await this.prisma.userSuspension.findFirst({ where: { userId, liftedAt: null } });
    if (existing) throw new BadRequestException('User is already suspended');
    const suspension = await this.prisma.userSuspension.create({ data: { userId, reason, suspendedBy: actorId } });
    await this.audit.log(actorId, 'admin', 'suspend_user', 'user', userId, reason);
    this.events.publish(EVT.ADMIN_USER_SUSPENDED, { userId, reason });
    return suspension;
  }

  async unsuspendUser(actorId: string, userId: string) {
    const existing = await this.prisma.userSuspension.findFirst({ where: { userId, liftedAt: null } });
    if (!existing) throw new BadRequestException('User is not currently suspended');
    const updated = await this.prisma.userSuspension.update({
      where: { id: existing.id },
      data: { liftedAt: new Date(), liftedBy: actorId },
    });
    await this.audit.log(actorId, 'admin', 'unsuspend_user', 'user', userId);
    this.events.publish(EVT.ADMIN_USER_UNSUSPENDED, { userId });
    return updated;
  }

  async suspendVehicle(actorId: string, vehicleId: string, reason: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    await this.prisma.vehicle.update({ where: { id: vehicleId }, data: { status: 'suspended' } });
    const suspension = await this.prisma.vehicleSuspension.create({ data: { vehicleId, reason, suspendedBy: actorId } });
    await this.audit.log(actorId, 'admin', 'suspend_vehicle', 'vehicle', vehicleId, reason);
    this.events.publish(EVT.ADMIN_VEHICLE_SUSPENDED, { vehicleId, reason });
    return suspension;
  }

  async forceReverification(actorId: string, userId: string) {
    await this.audit.log(actorId, 'admin', 'force_reverification', 'user', userId, 'Manager-triggered re-verification');
    this.events.publish('evt.identity.reverification_due', { userId, triggeredBy: actorId });
    return { userId, status: 'reverification_forced' };
  }

  /**
   * Manual Trust Score override — always logged with previous/new value and a
   * mandatory reason. This does NOT replace the algorithmic recalculation in
   * the Trust Score service; it's a managerial exception mechanism (e.g., a
   * confirmed false-positive fraud flag that tanked someone's score unfairly).
   */
  async overrideTrustScore(actorId: string, userId: string, newScore: number, reason: string) {
    const current = await this.prisma.trustScore.findUnique({ where: { userId } });
    if (!current) throw new NotFoundException('No trust score on file for this user');

    const updated = await this.prisma.trustScore.update({
      where: { userId },
      data: { overallScore: newScore, lastCalculatedAt: new Date() },
    });
    await this.prisma.trustScoreOverride.create({
      data: { userId, previousScore: current.overallScore, newScore, reason, overriddenBy: actorId },
    });
    await this.audit.log(actorId, 'admin', 'override_trust_score', 'trust_score', userId, reason, {
      previousScore: current.overallScore,
      newScore,
    });
    this.events.publish(EVT.ADMIN_TRUST_SCORE_OVERRIDDEN, { userId, previousScore: current.overallScore, newScore });
    return updated;
  }

  async overrideListingThreshold(actorId: string, listingId: string, minimumScore: number, minimumTier: string | undefined, reason: string) {
    const updated = await this.prisma.listingTrustThreshold.upsert({
      where: { listingId },
      update: { minimumScore, minimumTier: minimumTier as any },
      create: { listingId, minimumScore, minimumTier: minimumTier as any },
    });
    await this.audit.log(actorId, 'admin', 'override_listing_threshold', 'listing', listingId, reason);
    return updated;
  }
}
