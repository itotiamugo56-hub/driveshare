import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/event-bus/event-bus.service';
import { EVT } from '../../common/enums';

const REVEAL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService, private events: EventBusService) {}

  async submitReview(tripId: string, authorUserId: string, subjectUserId: string, rating: number, comment?: string) {
    const existing = await this.prisma.review.findUnique({ where: { tripId_authorUserId: { tripId, authorUserId } } });
    if (existing) throw new BadRequestException('Review already submitted for this trip by this author');

    const review = await this.prisma.review.create({
      data: { tripId, authorUserId, subjectUserId, rating, comment, visibility: 'hidden_pending_counterpart' },
    });
    this.events.publish(EVT.REVIEW_SUBMITTED, { tripId, authorUserId, subjectUserId });

    // Reveal both sides once both reviews exist for the trip (mutually blind design).
    const counterpart = await this.prisma.review.findFirst({ where: { tripId, authorUserId: { not: authorUserId } } });
    if (counterpart) {
      await this.revealPair(tripId);
      // Re-fetch rather than returning the stale pre-reveal object above, since
      // revealPair() updates visibility/revealedAt in the DB after `review` was captured.
      return this.prisma.review.findUniqueOrThrow({ where: { id: review.id } });
    }
    return review;
  }

  private async revealPair(tripId: string) {
    await this.prisma.review.updateMany({ where: { tripId }, data: { visibility: 'visible', revealedAt: new Date() } });
    this.events.publish(EVT.REVIEW_REVEALED, { tripId });
  }

  /** Reveal-window sweep: reveals a lone review once the time window lapses even without a counterpart. */
  async revealWindowSweep() {
    const cutoff = new Date(Date.now() - REVEAL_WINDOW_MS);
    const stale = await this.prisma.review.findMany({
      where: { visibility: 'hidden_pending_counterpart', submittedAt: { lt: cutoff } },
    });
    for (const review of stale) {
      await this.prisma.review.update({ where: { id: review.id }, data: { visibility: 'visible', revealedAt: new Date() } });
      this.events.publish(EVT.REVIEW_REVEALED, { tripId: review.tripId, reason: 'window_lapsed' });
    }
    return { revealed: stale.length };
  }

  async getReviewsForTrip(tripId: string, requestingUserId: string) {
    const reviews = await this.prisma.review.findMany({ where: { tripId } });
    return reviews.map((r) =>
      r.visibility === 'visible' || r.authorUserId === requestingUserId
        ? r
        : { id: r.id, tripId: r.tripId, visibility: r.visibility }, // hide content until reveal condition met
    );
  }

  async getUserReviewHistory(userId: string) {
    const reviews = await this.prisma.review.findMany({ where: { subjectUserId: userId, visibility: 'visible' } });
    const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;
    return { userId, reviewCount: reviews.length, averageRating: avgRating, reviews };
  }

  async attachMedia(reviewId: string, mediaRefs: string[]) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    return this.prisma.review.update({ where: { id: reviewId }, data: { mediaRefs: [...review.mediaRefs, ...mediaRefs] } });
  }

  async getBadges(userId: string) {
    return this.prisma.badgeStatus.findMany({ where: { userId } });
  }

  /** [INFERRED] Nightly badge eligibility re-evaluation job. */
  async evaluateBadges(userId: string) {
    const { reviewCount, averageRating } = await this.getUserReviewHistory(userId);
    const eligible = reviewCount >= 10 && (averageRating ?? 0) >= 4.5;

    for (const badgeType of ['super_host', 'elite_renter'] as const) {
      const existing = await this.prisma.badgeStatus.findUnique({ where: { userId_badgeType: { userId, badgeType } } });
      if (eligible && !existing?.earnedAt) {
        await this.prisma.badgeStatus.upsert({
          where: { userId_badgeType: { userId, badgeType } },
          update: { earnedAt: new Date(), rollingWindowMetrics: { reviewCount, averageRating } },
          create: { userId, badgeType, earnedAt: new Date(), rollingWindowMetrics: { reviewCount, averageRating } },
        });
        this.events.publish(EVT.BADGE_EARNED, { userId, badgeType });
      } else if (!eligible && existing?.earnedAt) {
        await this.prisma.badgeStatus.update({ where: { userId_badgeType: { userId, badgeType } }, data: { earnedAt: null } });
        this.events.publish(EVT.BADGE_REVOKED, { userId, badgeType });
      }
    }
    return { userId, eligible };
  }
}
