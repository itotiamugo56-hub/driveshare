import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service';
import { EventBusService } from '../common/event-bus/event-bus.service';
import { EVT } from '../common/enums';
import { ReviewsService } from '../modules/reviews/reviews.service';
import { DisputeService } from '../modules/dispute/dispute.service';
import { MonitoringService } from '../modules/admin-ops/monitoring/monitoring.service';
import { IncidentsService } from '../modules/admin-ops/incidents/incidents.service';

/**
 * Consolidates every "[INFERRED] scheduled job" called out across the spec's
 * per-service sections: identity re-verification sweep, retention purge,
 * badge re-evaluation, and dispute SLA escalation.
 */
@Injectable()
export class ScheduledJobsService {
  private readonly logger = new Logger('ScheduledJobs');

  constructor(
    private prisma: PrismaService,
    private events: EventBusService,
    private reviews: ReviewsService,
    private disputes: DisputeService,
    private monitoring: MonitoringService,
    private incidents: IncidentsService,
  ) {}

  // Section 13 (Admin & Operations): periodic alert-rule evaluation against live
  // operational metrics pulled from the Monitoring service's feeds.
  @Cron(CronExpression.EVERY_5_MINUTES)
  async alertEvaluationSweep() {
    const [fraud, payments, disputes] = await Promise.all([
      this.monitoring.fraudFeed(),
      this.monitoring.paymentsFeed(),
      this.monitoring.disputeFeed(),
    ]);
    const metricSnapshot = {
      'fraud.blocked_bookings_24h': fraud.blockedBookingsLast24h,
      'payments.auth_failures_24h': payments.authFailuresLast24h,
      'payments.payout_backlog': payments.payoutBacklogCount,
      'disputes.sla_at_risk_count': disputes.approachingOrPastSla.length,
    };
    const result = await this.incidents.evaluateMetrics(metricSnapshot);
    if (result.fired.length > 0) {
      this.logger.warn(`Alert evaluation sweep: ${result.fired.length} alert(s) fired`);
    }
  }

  // Section 1.3: nightly scan for expiring licenses / due re-verifications.
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async licenseReverificationSweep() {
    const soon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const expiring = await this.prisma.licenseRecord.findMany({ where: { expirationDate: { lt: soon } } });
    for (const license of expiring) {
      this.events.publish(EVT.IDENTITY_LICENSE_EXPIRING_SOON, { userId: license.userId, licenseId: license.id });
    }
    this.logger.log(`License reverification sweep: ${expiring.length} flagged`);
  }

  // Section 5.3: retention-policy sweep to auto-purge documents past policy window.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async retentionPurgeSweep() {
    const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // 1 year standard retention
    const result = await this.prisma.tokenizedDocument.deleteMany({
      where: { retentionPolicy: 'standard', createdAt: { lt: cutoff } },
    });
    this.logger.log(`Retention purge: removed ${result.count} documents past policy window`);
  }

  // Section 9.3: SLA tracking — auto-escalate disputes that exceed target resolution time in their tier.
  @Cron(CronExpression.EVERY_HOUR)
  async disputeSlaSweep() {
    const slaHours: Record<string, number> = { auto_review: 1, mediator_review: 72 };
    const openDisputes = await this.prisma.disputeCase.findMany({ where: { status: 'open' } });
    for (const dispute of openDisputes) {
      const hoursOpen = (Date.now() - dispute.createdAt.getTime()) / (1000 * 60 * 60);
      const sla = slaHours[dispute.tier];
      if (sla && hoursOpen > sla && dispute.tier !== 'arbitration') {
        await this.disputes.escalate(dispute.id);
        this.logger.warn(`Dispute ${dispute.id} exceeded SLA for tier ${dispute.tier}, auto-escalated`);
      }
    }
  }

  // Section 12.3: reveal-window sweep + nightly badge re-evaluation.
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async reviewAndBadgeSweep() {
    const revealResult = await this.reviews.revealWindowSweep();
    this.logger.log(`Review reveal-window sweep: ${revealResult.revealed} reviews revealed`);

    const userIds = await this.prisma.user.findMany({ select: { id: true } });
    for (const { id } of userIds) {
      await this.reviews.evaluateBadges(id);
    }
  }
}
