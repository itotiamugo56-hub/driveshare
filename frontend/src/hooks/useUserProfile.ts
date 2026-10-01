import { useQuery } from '@tanstack/react-query';
import { reviewsApi } from '../api/domains/reviews.api';
import { useAuthStore } from '../store/authStore';

/**
 * Added per explicit product decision (verification-check follow-up,
 * "individual profile with reviews/star ratings" gap). Backend endpoints
 * (`GET /reviews/users/:userId`, `GET /badges/users/:userId`) already
 * existed and were already wrapped 1:1 in `reviews.api.ts` — nothing new on
 * the backend was needed for this gap, only a frontend consumer of it.
 *
 * Not zod-validated: consistent with the scope decision already documented
 * in `vehicleListing.schemas.ts` ("zod validation for the other 12 backend
 * domains ... is a larger, separate effort"). These types are written by
 * hand from `reviews.service.ts` / `schema.prisma`'s `Review`/`BadgeStatus`
 * models rather than derived from a zod schema.
 */
export interface UserReview {
  id: string;
  tripId: string;
  authorUserId: string;
  subjectUserId: string;
  rating: number;
  comment: string | null;
  mediaRefs: string[];
  visibility: 'hidden_pending_counterpart' | 'hidden_pending_window' | 'visible';
  submittedAt: string;
  revealedAt: string | null;
}

export interface UserReviewHistory {
  userId: string;
  reviewCount: number;
  averageRating: number | null;
  reviews: UserReview[];
}

export interface UserBadge {
  id: string;
  userId: string;
  badgeType: 'super_host' | 'elite_renter';
  earnedAt: string | null;
  rollingWindowMetrics: Record<string, unknown>;
}

export function useUserReviewHistory(userId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['reviews', 'users', userId],
    queryFn: () => reviewsApi.getUserHistory(userId!, token) as Promise<UserReviewHistory>,
    enabled: !!userId,
  });
}

export function useUserBadges(userId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['badges', 'users', userId],
    queryFn: () => reviewsApi.getBadges(userId!, token) as Promise<UserBadge[]>,
    enabled: !!userId,
  });
}
