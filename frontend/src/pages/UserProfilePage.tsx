import { useParams } from 'react-router-dom';
import { useUserReviewHistory, useUserBadges } from '../hooks/useUserProfile';
import { StatusBanner } from '../components/StatusBanner';

const BADGE_LABEL: Record<string, string> = {
  super_host: 'Super Host',
  elite_renter: 'Elite Renter',
};

/**
 * Added per explicit product decision (verification-check follow-up,
 * "individual profile with reviews/star ratings" gap — previously confirmed
 * PARTIALLY supported: backend endpoints existed and were already wrapped,
 * but no frontend page consumed them). Auth-gated on the backend (`GET
 * /reviews/users/:userId`, `GET /badges/users/:userId` are not `@Public()`)
 * — an anonymous visitor sees the sign-in-required message below rather
 * than the profile. See implementation summary for why this was not made
 * public in the same way vehicle photos/calendar were: review text is
 * unmoderated user-generated content, a different risk profile than vehicle
 * specs, and opening it was not something this task's direction covered.
 */
export function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const reviewsQuery = useUserReviewHistory(userId);
  const badgesQuery = useUserBadges(userId);

  if (reviewsQuery.isLoading) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: 24 }}>
        <StatusBanner kind="loading" message="Loading profile…" />
      </div>
    );
  }

  if (reviewsQuery.isError) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: 24 }}>
        <StatusBanner
          kind="error"
          message={`Could not load this profile: ${reviewsQuery.error instanceof Error ? reviewsQuery.error.message : 'sign-in required'}`}
        />
      </div>
    );
  }

  const history = reviewsQuery.data;
  const badges = badgesQuery.data ?? [];
  const earnedBadges = badges.filter((b) => b.earnedAt);

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 24, textAlign: 'left' }}>
      <h1 style={{ fontSize: 24 }}>User Profile</h1>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
        {history?.averageRating != null ? (
          <span style={{ fontSize: 20 }}>★ {history.averageRating.toFixed(1)}</span>
        ) : (
          <span style={{ fontSize: 14, color: 'var(--text)' }}>No ratings yet</span>
        )}
        <span style={{ fontSize: 13, color: 'var(--text)' }}>
          {history?.reviewCount ?? 0} review{history?.reviewCount === 1 ? '' : 's'}
        </span>
      </div>

      {earnedBadges.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {earnedBadges.map((b) => (
            <span
              key={b.id}
              style={{
                border: '1px solid var(--accent-border)',
                color: 'var(--accent)',
                borderRadius: 999,
                padding: '2px 10px',
                fontSize: 12,
              }}
            >
              {BADGE_LABEL[b.badgeType] ?? b.badgeType}
            </span>
          ))}
        </div>
      )}

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Reviews</h2>
      {history && history.reviews.length === 0 && (
        <StatusBanner kind="empty" message="No visible reviews yet." />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
        {history?.reviews.map((review) => (
          <div key={review.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>★ {review.rating}</span>
              <span style={{ fontSize: 12, color: 'var(--text)' }}>
                {new Date(review.submittedAt).toLocaleDateString()}
              </span>
            </div>
            {review.comment && <p style={{ marginTop: 6, fontSize: 14 }}>{review.comment}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
