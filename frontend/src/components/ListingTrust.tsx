import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { vehicleListingApi } from '../api/domains/vehicleListing.api';
import { useAuthStore } from '../store/authStore';
import { useUserReviewHistory, useUserBadges } from '../hooks/useUserProfile';
import { friendlyError } from '../lib/errors';

/** Host reputation: rating, badge, and the most recent visible reviews. */
export function HostTrust({ ownerId }: { ownerId: string }) {
  const rev = useUserReviewHistory(ownerId);
  const badges = useUserBadges(ownerId);
  if (rev.isLoading) return <div className="skel" style={{ height: 110 }} aria-busy="true" />;
  if (rev.isError) return <p className="note warn">{friendlyError(rev.error, 'host reviews')}</p>;
  const h = rev.data!;
  const visible = h.reviews.filter((r) => r.visibility === 'visible').slice(0, 3);
  const superHost = badges.data?.some((b) => b.badgeType === 'super_host' && b.earnedAt);
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 22, color: 'var(--text-h)' }}>{h.averageRating != null ? `★ ${h.averageRating.toFixed(1)}` : 'No rating yet'}</b>
        <span>{h.reviewCount} {h.reviewCount === 1 ? 'review' : 'reviews'}</span>
        {superHost && <span className="pill tier-elite">Super Host</span>}
      </div>
      {h.reviewCount === 0 && <p>New host. Their first trips will appear here.</p>}
      {visible.map((r) => <blockquote key={r.id} className="quote">{'★'.repeat(r.rating)} {r.comment ?? 'No written comment.'}</blockquote>)}
      <details><summary>Why can I trust these reviews?</summary>
        Renter and host write reviews separately and neither sees the other's until both are in. That keeps them honest.</details>
      <p style={{ marginBottom: 0 }}><Link to={`/users/${ownerId}`}>See the full host profile</Link></p>
    </div>
  );
}

/** Latest recorded condition of the car: the proof that protects a renter from unfair damage claims. */
export function ConditionCard({ vehicleId }: { vehicleId: string }) {
  const { accessToken, userId } = useAuthStore();
  const q = useQuery({
    queryKey: ['baseline', vehicleId],
    queryFn: () => vehicleListingApi.getLatestConditionBaseline(vehicleId, accessToken) as Promise<{
      odometerReading?: number | null; fuelOrChargeLevel?: number | null; capturedAt: string; aiDamageAnnotations?: unknown[]; mediaAssetRefs?: string[] } | null>,
    enabled: !!userId,
  });
  if (!userId) return <p className="note">Sign in to see the condition report for this car: mileage, fuel level and any marks already on it.</p>;
  if (q.isLoading) return <div className="skel" style={{ height: 90 }} aria-busy="true" />;
  if (q.isError) return <p className="note warn">{friendlyError(q.error, 'the condition report')}</p>;
  const b = q.data;
  if (!b) return <p className="note">The host hasn't added a condition report yet. Ask them before you book.</p>;
  const marks = b.aiDamageAnnotations?.length ?? 0;
  return (
    <div className="bd">
      <div className="line"><span>Recorded</span><span>{new Date(b.capturedAt).toLocaleDateString()}</span></div>
      {b.odometerReading != null && <div className="line"><span>Mileage</span><span>{b.odometerReading.toLocaleString()}</span></div>}
      {b.fuelOrChargeLevel != null && <div className="line"><span>Fuel or charge</span><span>{Math.round(b.fuelOrChargeLevel * (b.fuelOrChargeLevel <= 1 ? 100 : 1))}%</span></div>}
      <div className="line"><span>Marks already on the car</span><span>{marks === 0 ? 'None found' : `${marks} noted`}</span></div>
      <p style={{ fontSize: 13, marginBottom: 0 }}>Photos are taken again after your trip. Anything already noted here won't be blamed on you.</p>
    </div>
  );
}

export function DepositNote() {
  return (
    <details className="how" style={{ margin: '12px 0 0' }}>
      <summary>What is a deposit hold?</summary>
      <p style={{ margin: '8px 0 0' }}>A temporary hold on your card, like at a hotel. It is not a charge. It is released after a clean return. If there is damage, only the proven amount is taken.</p>
    </details>
  );
}
