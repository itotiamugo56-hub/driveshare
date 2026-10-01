import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useEligibility, useCoverTiers, type CoverTier } from '../hooks/useRenterCheck';
import { friendlyError } from '../lib/errors';
import { StatusBanner } from './StatusBanner';

const TIER_MEANING: Record<string, string> = {
  new: 'You just joined',
  standard: 'You have a verified account',
  trusted: 'You have a good record',
  elite: 'You have an excellent record',
};

/** Answers "can I book this car?" before the renter picks dates, in plain words, with a next step. */
export function EligibilityCard({ listingId }: { listingId: string }) {
  const userId = useAuthStore((s) => s.userId);
  const q = useEligibility(listingId);
  if (!userId) return <p className="note"><Link to={`/login?next=${encodeURIComponent(location.pathname)}`}>Sign in</Link> and we'll tell you right here whether you can book this car.</p>;
  if (q.isLoading) return <div className="skel" style={{ height: 70 }} aria-busy="true" />;
  if (q.isError)
    return (
      <div className="note warn" role="alert">
        {friendlyError(q.error, 'your booking eligibility')}{' '}
        <button className="link" onClick={() => q.refetch()}>Try again</button>
      </div>
    );
  const r = q.data!;
  if (r.reason === 'No trust score on file')
    return <div className="note warn">We haven't scored your account yet. <Link to="/verify">Verify your ID</Link> and add your licence, then check back.</div>;
  if (r.eligible)
    return <div className="note ok" role="status">✓ You can book this car. Your level: <b>{r.userTier}</b> ({TIER_MEANING[r.userTier ?? ''] ?? ''}).</div>;
  const need = r.threshold?.minimumTier;
  return (
    <div className="note warn" role="status">
      <b>Not yet.</b> This host asks for {need ? `the ${need} level` : 'a higher trust score'}; you're at {r.userTier ?? 'new'}.
      <details><summary>How do I get there?</summary>
        Levels rise as you <Link to="/verify">verify your ID and licence</Link>, finish trips and earn good reviews. Cars with a lower requirement are open to you today.</details>
    </div>
  );
}

const money = (cents: number, cur: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(cents / 100);
const NAME = { baseline: 'Basic', standard: 'Standard', premium: 'Complete' } as const;

/** Explains each cover level as "you pay X first, we cover the rest up to Y". */
export function CoverPicker({ currency, value, onPick }: { currency: string; value?: string | null; onPick?: (t: CoverTier) => void }) {
  const q = useCoverTiers();
  const [inner, setInner] = useState<string | null>(null);
  const pick = value ?? inner;
  const choose = (t: CoverTier) => { setInner(t.id); onPick?.(t); };
  // Pre-select Standard when a parent needs a choice, so the renter always sees a real total.
  useEffect(() => {
    const std = q.data?.find((t) => t.name === 'standard');
    if (onPick && value == null && std) onPick(std);
  }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (q.isLoading) return <div className="skel" style={{ height: 120 }} aria-busy="true" />;
  if (q.isError)
    return <StatusBanner kind="error" message={`${friendlyError(q.error, 'cover options')} You'll see them again at checkout.`} />;
  const tiers = [...(q.data ?? [])].sort((a, b) => b.deductibleCents - a.deductibleCents);
  return (
    <div style={{ display: 'grid', gap: 8 }} role="radiogroup" aria-label="Choose your cover">
      {tiers.map((t) => (
        <button key={t.id} role="radio" aria-checked={pick === t.id} className="tier" onClick={() => choose(t)}>
          <b>{NAME[t.name] ?? t.name}</b>
          <span>{t.deductibleCents === 0 ? 'You pay nothing if something goes wrong.' : `If something goes wrong, you pay the first ${money(t.deductibleCents, currency)}.`}
            {' '}We cover the rest up to {money(Number(t.liabilityLimitCents), currency)}.</span>
        </button>
      ))}
      <p className="note" style={{ margin: 0 }}>Not sure? Standard suits most trips. You can change this at checkout.</p>
    </div>
  );
}

/** Four-step "how this works" so a first-time visitor needs no training. */
export function HowItWorks() {
  const steps: [string, string][] = [
    ['Find a car', 'Pick your dates. Every price shown is per day.'],
    ['Check it fits you', 'Each car says whether your trust level lets you book it.'],
    ['Choose cover and book', "You see the deductible up front. You aren't charged on the car page."],
    ['Pick up and return', 'Photos are taken before and after, so damage claims are fair.'],
  ];
  return (
    <details className="how">
      <summary>New here? See how it works in 30 seconds</summary>
      <ol>{steps.map(([h, p]) => <li key={h}><b>{h}.</b> {p}</li>)}</ol>
    </details>
  );
}
