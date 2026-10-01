import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class MonitoringService {
  constructor(private prisma: PrismaService) {}

  async fraudFeed() {
    const since = new Date(Date.now() - RECENT_WINDOW_MS);
    const [recentEvaluations, openCases, blockedBookings] = await Promise.all([
      this.prisma.riskEvaluation.findMany({ where: { evaluatedAt: { gte: since } }, orderBy: { evaluatedAt: 'desc' }, take: 100 }),
      this.prisma.fraudCase.findMany({ where: { status: { in: ['open', 'under_review'] } }, orderBy: { createdAt: 'desc' } }),
      this.prisma.riskEvaluation.count({ where: { decision: 'block', evaluatedAt: { gte: since } } }),
    ]);
    return { windowHours: 24, recentEvaluationCount: recentEvaluations.length, blockedBookingsLast24h: blockedBookings, openCases };
  }

  async disputeFeed() {
    const [byTier, slaAtRisk] = await Promise.all([
      this.prisma.disputeCase.groupBy({ by: ['tier', 'status'], _count: { id: true } }),
      this.prisma.disputeCase.findMany({
        where: { status: 'open', tier: 'mediator_review', createdAt: { lt: new Date(Date.now() - 48 * 60 * 60 * 1000) } },
      }),
    ]);
    return { byTierAndStatus: byTier, approachingOrPastSla: slaAtRisk };
  }

  async fleetAccessFeed() {
    const since = new Date(Date.now() - RECENT_WINDOW_MS);
    const [activeKeys, recentTamperEvents, recentGeofenceBreaches, pendingImmobilizations] = await Promise.all([
      this.prisma.digitalKey.count({ where: { status: 'active' } }),
      this.prisma.telematicsEvent.findMany({ where: { eventType: 'tamper_detected', occurredAt: { gte: since } }, orderBy: { occurredAt: 'desc' } }),
      this.prisma.telematicsEvent.findMany({ where: { eventType: 'geofence_breach', occurredAt: { gte: since } }, orderBy: { occurredAt: 'desc' } }),
      this.prisma.telematicsEvent.count({ where: { eventType: 'unexpected_disconnect', resolvedFlag: false } }),
    ]);
    return { activeDigitalKeys: activeKeys, recentTamperEvents, recentGeofenceBreaches, unresolvedDisconnectEvents: pendingImmobilizations };
  }

  async paymentsFeed() {
    const since = new Date(Date.now() - RECENT_WINDOW_MS);
    const [authFailures, payoutBacklog, depositsHeld] = await Promise.all([
      this.prisma.paymentAuthorization.count({ where: { status: 'failed', authorizedAt: { gte: since } } }),
      this.prisma.payout.count({ where: { status: { in: ['scheduled', 'processing'] } } }),
      this.prisma.depositHold.count({ where: { status: 'held' } }),
    ]);
    return { authFailuresLast24h: authFailures, payoutBacklogCount: payoutBacklog, depositsCurrentlyHeld: depositsHeld };
  }

  async insuranceClaimsFeed() {
    const claimsByStatus = await this.prisma.claim.groupBy({ by: ['status'], _count: { id: true } });
    const agingClaims = await this.prisma.claim.findMany({
      where: { status: { in: ['filed', 'under_review'] }, createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    });
    return { claimsByStatus, agingClaimsOverOneWeek: agingClaims };
  }

  /** Scheduled-job / event-bus health — surfaces what's mocked vs. live and basic counts as a stand-in for real uptime metrics. */
  async systemHealth() {
    const [userCount, listingCount, tripLedgerEntries] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.listing.count(),
      this.prisma.transactionLedgerEntry.count(),
    ]);
    return {
      status: 'ok',
      note: 'Reference implementation exposes basic table counts; production would wire in real service-mesh/uptime metrics here.',
      userCount,
      listingCount,
      transactionLedgerEntries: tripLedgerEntries,
    };
  }

  async trustTrends() {
    const tierCounts = await this.prisma.trustScore.groupBy({ by: ['tier'], _count: { userId: true } });
    const recentBadges = await this.prisma.badgeStatus.findMany({ where: { earnedAt: { not: null } }, orderBy: { earnedAt: 'desc' }, take: 20 });
    return { tierDistribution: tierCounts, recentlyEarnedBadges: recentBadges };
  }
}
