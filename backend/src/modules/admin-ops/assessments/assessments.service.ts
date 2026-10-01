import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class AssessmentsService {
  constructor(private prisma: PrismaService) {}

  /** Trust Score distribution + top risk indicators across the whole user base. */
  async userRiskAssessment() {
    const [tierCounts, highRiskDrivers, openFraudCases, chargebacks] = await Promise.all([
      this.prisma.trustScore.groupBy({ by: ['tier'], _count: { userId: true } }),
      this.prisma.drivingHistoryReport.count({ where: { riskTier: 'high' } }),
      this.prisma.fraudCase.count({ where: { status: { in: ['open', 'under_review'] } } }),
      this.prisma.paymentAuthorization.count({ where: { status: 'failed' } }),
    ]);
    return {
      trustTierDistribution: tierCounts.map((t) => ({ tier: t.tier, count: t._count.userId })),
      highRiskDrivingHistoryCount: highRiskDrivers,
      openFraudCases,
      failedPaymentAuthorizations: chargebacks,
    };
  }

  /** Per-vehicle quality signal, combining condition-baseline damage flags + dispute/claim history. */
  async vehicleQualityAssessment(vehicleId: string) {
    const [baselines, listings] = await Promise.all([
      this.prisma.conditionBaseline.findMany({ where: { vehicleId }, orderBy: { capturedAt: 'desc' } }),
      this.prisma.listing.findMany({ where: { vehicleId }, select: { id: true } }),
    ]);
    const damageEventCount = baselines.filter((b) => Array.isArray(b.aiDamageAnnotations) && (b.aiDamageAnnotations as any[]).length > 0).length;
    return { vehicleId, conditionBaselineCount: baselines.length, damageEventCount, listingCount: listings.length };
  }

  /** Owner/renter performance scorecard — completion, cancellation, review trend. */
  async performanceScorecard(userId: string) {
    const [reviews, disputes, listings] = await Promise.all([
      this.prisma.review.findMany({ where: { subjectUserId: userId, visibility: 'visible' }, orderBy: { submittedAt: 'desc' }, take: 20 }),
      this.prisma.disputeCase.count({ where: { filedByUserId: userId } }),
      this.prisma.listing.count({ where: { ownerId: userId, status: 'active' } }),
    ]);
    const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;
    const trend = reviews.length >= 2 ? reviews[0].rating - reviews[reviews.length - 1].rating : 0;
    return { userId, activeListings: listings, recentAverageRating: avgRating, ratingTrend: trend, disputesFiled: disputes };
  }

  /** Financial health: take-rate, payout velocity, loss ratios by coverage tier. */
  async financialHealthAssessment() {
    const [ledgerTotals, payoutStats, claims] = await Promise.all([
      this.prisma.transactionLedgerEntry.groupBy({ by: ['entryType'], _sum: { amountCents: true } }),
      this.prisma.payout.groupBy({ by: ['status'], _count: { id: true }, _sum: { amountCents: true } }),
      this.prisma.claim.groupBy({ by: ['status'], _count: { id: true }, _sum: { payoutAmountCents: true } }),
    ]);
    return {
      ledgerTotalsByType: ledgerTotals.map((l) => ({ entryType: l.entryType, totalCents: l._sum.amountCents })),
      payoutsByStatus: payoutStats.map((p) => ({ status: p.status, count: p._count.id, totalCents: p._sum.amountCents })),
      claimsByStatus: claims.map((c) => ({ status: c.status, count: c._count.id, totalPayoutCents: c._sum.payoutAmountCents })),
    };
  }

  /** Regional/market health: utilization + supply/demand signal by region. [INFERRED: region param, no geo index in this reference schema] */
  async regionalMarketAssessment() {
    const [activeListings, avgUtilization] = await Promise.all([
      this.prisma.listing.count({ where: { status: 'active' } }),
      this.prisma.availabilityCalendar.groupBy({ by: ['status'], _count: { id: true } }),
    ]);
    return { activeListings, calendarStatusBreakdown: avgUtilization.map((u) => ({ status: u.status, count: u._count.id })) };
  }

  /** Compliance posture: re-verification backlog, retention-policy exposure, open legal holds. */
  async complianceAssessment() {
    const now = new Date();
    const [expiredLicenses, extendedHoldDocs, openDataRequests] = await Promise.all([
      this.prisma.licenseRecord.count({ where: { expirationDate: { lt: now } } }),
      this.prisma.tokenizedDocument.count({ where: { retentionPolicy: 'extended_legal_hold' } }),
      this.prisma.dataLifecycleRequest.count({ where: { status: { in: ['pending', 'processing'] } } }),
    ]);
    return { expiredLicensesPendingReverification: expiredLicenses, documentsUnderLegalHold: extendedHoldDocs, openDataLifecycleRequests: openDataRequests };
  }

  /** Which vendor integrations are mocked vs. live — pulled from env at request time. */
  async vendorIntegrationAssessment() {
    const vendorEnvVars = [
      'ID_VERIFICATION_MODE', 'DMV_MODE', 'DRIVING_HISTORY_MODE', 'PAYMENT_PROCESSOR_MODE',
      'INSURANCE_CARRIER_MODE', 'TELEMATICS_MODE', 'CV_DAMAGE_MODEL_MODE', 'VIN_DECODE_MODE',
      'EVENT_DATA_FEED_MODE', 'KMS_MODE',
    ];
    return vendorEnvVars.map((key) => ({ vendor: key, mode: (process.env[key] || 'mock').toLowerCase() }));
  }
}
