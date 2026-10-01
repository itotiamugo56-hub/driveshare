const TIER_LABEL: Record<string, string> = { new: 'New host', standard: 'Standard', trusted: 'Trusted host', elite: 'Elite host' };

const Shield = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><path d="M8 1 2 3.5v4c0 3.5 2.4 6 6 7.5 3.6-1.5 6-4 6-7.5v-4z" /></svg>
);

/** Renders `Listing.minimumTrustTier` (tier-coloured pill) and the owner's average rating. */
export function TrustBadge({ tier, avgRating }: { tier?: string | null; avgRating?: number | null }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, flexWrap: 'wrap' }}>
      {tier && (
        <span className={`pill tier-${tier}`}>
          <Shield />
          {TIER_LABEL[tier] ?? tier}
        </span>
      )}
      {avgRating != null && <span style={{ color: 'var(--text-h)', fontWeight: 600 }}>★ {avgRating.toFixed(1)}</span>}
    </div>
  );
}
