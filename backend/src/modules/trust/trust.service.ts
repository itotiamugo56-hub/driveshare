import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/interfaces/request-with-user';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/event-bus/event-bus.service';
import { EVT } from '../../common/enums';

const TIER_THRESHOLDS: [number, 'new' | 'standard' | 'trusted' | 'elite'][] = [
  [850, 'elite'],
  [650, 'trusted'],
  [400, 'standard'],
  [0, 'new'],
];

function scoreToTier(score: number): 'new' | 'standard' | 'trusted' | 'elite' {
  return TIER_THRESHOLDS.find(([min]) => score >= min)![1];
}

@Injectable()
export class TrustService {
  constructor(private prisma: PrismaService, private events: EventBusService) {}

  private static readonly STAFF = ['admin', 'support_agent', 'arbitrator', 'service'];
  private isStaff(u: AuthenticatedUser) { return TrustService.STAFF.includes(u.role); }

  /** A trust score is private: the person themselves, or staff. */
  assertMayReadScore(user: AuthenticatedUser, subjectUserId: string) {
    if (user.userId === subjectUserId || this.isStaff(user)) return;
    throw new ForbiddenException('You can only see your own trust score.');
  }

  /** Eligibility is answerable to the renter, staff, or the host of that listing (deciding on a request). */
  async assertMayCheckEligibility(user: AuthenticatedUser, subjectUserId: string, listingId: string) {
    if (user.userId === subjectUserId || this.isStaff(user)) return;
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId }, select: { ownerId: true } });
    if (listing?.ownerId === user.userId) return;
    throw new ForbiddenException('You can only check your own eligibility, or renters of your own listings.');
  }

  /** Only the listing's owner (or staff) may change who can book it. */
  async assertMaySetThreshold(user: AuthenticatedUser, listingId: string) {
    if (this.isStaff(user)) return;
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId }, select: { ownerId: true } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.ownerId !== user.userId) throw new ForbiddenException('Only the listing owner can set who may book it.');
  }

  async getScore(userId: string) {
    const score = await this.prisma.trustScore.findUnique({ where: { userId } });
    if (!score) throw new NotFoundException('Trust score not found for user');
    return score;
  }

  /**
   * Core scoring algorithm. Weighted blend of verification completeness,
   * trip history, behavior, and dispute/fraud penalties, per the concept doc's
   * "verified transactional data weighted more heavily than self-reported info".
   */
  async recalculate(userId: string) {
    const [verification, trips, disputes, reviews, chargebacks] = await Promise.all([
      this.prisma.verificationSession.findFirst({ where: { userId, status: 'approved' } }),
      this.prisma.transactionLedgerEntry.count({ where: { tripId: { not: undefined } } }), // trip-linkage simplified for demo
      this.prisma.disputeCase.count({ where: { filedByUserId: userId } }),
      this.prisma.review.findMany({ where: { subjectUserId: userId, visibility: 'visible' } }),
      this.prisma.riskEvaluation.count({ where: { userId, decision: 'block' } }),
    ]);

    const verificationFactor = verification ? 1 : 0.3;
    const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length / 5 : 0.6;
    const disputePenalty = Math.max(0, 1 - disputes * 0.1);
    const fraudPenalty = Math.max(0, 1 - chargebacks * 0.25);

    const factorBreakdown = {
      verification: verificationFactor,
      tripHistory: Math.min(1, trips / 20),
      behavior: avgRating,
      disputes: disputePenalty,
      fraud: fraudPenalty,
    };

    const composite =
      factorBreakdown.verification * 0.3 +
      factorBreakdown.tripHistory * 0.2 +
      factorBreakdown.behavior * 0.25 +
      factorBreakdown.disputes * 0.15 +
      factorBreakdown.fraud * 0.1;

    const overallScore = Math.round(composite * 1000);
    const newTier = scoreToTier(overallScore);

    const existing = await this.prisma.trustScore.findUnique({ where: { userId } });
    const previousTier = existing?.tier;

    const updated = await this.prisma.trustScore.upsert({
      where: { userId },
      update: {
        overallScore,
        tier: newTier,
        factorBreakdown,
        lastCalculatedAt: new Date(),
        scoreVersion: { increment: 1 },
      },
      create: { userId, overallScore, tier: newTier, factorBreakdown, scoreVersion: 1 },
    });

    this.events.publish(EVT.TRUST_SCORE_UPDATED, { userId, overallScore, tier: newTier });
    if (previousTier && previousTier !== newTier) {
      this.events.publish(EVT.TRUST_TIER_CHANGED, { userId, previousTier, newTier });
    }
    return updated;
  }

  async importExternalHistory(userId: string, sourcePlatform: string, verificationMethod: string) {
    // [Mocked] OAuth verification of external platform history — see mock-providers for the
    // pattern; a dedicated external-history OAuth provider would live there in a live build.
    const weight = verificationMethod === 'oauth_pull' ? 0.15 : 0.08;
    const record = await this.prisma.externalHistoryImport.create({
      data: { userId, sourcePlatform, verificationMethod, status: 'verified', weightApplied: weight },
    });
    await this.recalculate(userId);
    return record;
  }

  async getImportStatus(importId: string) {
    const record = await this.prisma.externalHistoryImport.findUnique({ where: { id: importId } });
    if (!record) throw new NotFoundException('Import not found');
    return record;
  }

  async getThreshold(listingId: string) {
    const threshold = await this.prisma.listingTrustThreshold.findUnique({ where: { listingId } });
    return threshold ?? { listingId, minimumScore: 0, minimumTier: null };
  }

  async setThreshold(listingId: string, minimumScore: number, minimumTier?: string) {
    return this.prisma.listingTrustThreshold.upsert({
      where: { listingId },
      update: { minimumScore, minimumTier: minimumTier as any },
      create: { listingId, minimumScore, minimumTier: minimumTier as any },
    });
  }

  async checkEligibility(userId: string, listingId: string) {
    const [score, threshold] = await Promise.all([
      this.prisma.trustScore.findUnique({ where: { userId } }),
      this.getThreshold(listingId),
    ]);
    if (!score) return { eligible: false, reason: 'No trust score on file' };
    const meetsScore = score.overallScore >= (threshold.minimumScore ?? 0);
    const tierOrder = ['new', 'standard', 'trusted', 'elite'];
    const meetsTier = threshold.minimumTier
      ? tierOrder.indexOf(score.tier) >= tierOrder.indexOf(threshold.minimumTier)
      : true;
    return { eligible: meetsScore && meetsTier, userScore: score.overallScore, userTier: score.tier, threshold };
  }
}
