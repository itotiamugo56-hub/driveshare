import { Link, Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ownerApi, type OwnerListing } from '../api/domains/owner.api';
import { tripsApi, type Trip } from '../api/domains/trips.api';
import { useAuthStore } from '../store/authStore';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { friendlyError, serverMessage } from '../lib/errors';
import { money, ownerNetCents } from '../lib/owner';
import { StatusBanner } from '../components/StatusBanner';
import { useCapabilities } from '../hooks/useCapabilities';

const fmt = (d: string) => new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' });
const TIER: Record<string, string> = { new: 'New', standard: 'Standard', trusted: 'Trusted', elite: 'Elite' };

/** The host's home: what needs an answer, what's coming up, and their cars. One clear next action at all times. */
export function OwnerHomePage() {
  useDocumentTitle('Host dashboard');
  const { userId, accessToken: token } = useAuthStore();
  const qc = useQueryClient();
  const on = !!userId;
  const cap = useCapabilities();
  const listings = useQuery({ queryKey: ['owner-listings', userId], queryFn: () => ownerApi.myListings(token), enabled: on });
  const vehicles = useQuery({ queryKey: ['owner-vehicles', userId], queryFn: () => ownerApi.myVehicles(token), enabled: on });
  const trips = useQuery({ queryKey: ['my-trips', userId], queryFn: () => tripsApi.mine(token), enabled: on });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['my-trips'] }); qc.invalidateQueries({ queryKey: ['owner-listings'] }); };
  const respond = useMutation({ mutationFn: (v: { id: string; accept: boolean }) => tripsApi.respond(v.id, v.accept, token), onSuccess: refresh });
  const toggle = useMutation({ mutationFn: (l: OwnerListing) => ownerApi.updateListing(l.id, { status: l.status === 'active' ? 'paused' : 'active' }, token), onSuccess: refresh });

  if (!userId) return <Navigate to="/login?next=/owner" replace />;
  if (listings.isLoading || vehicles.isLoading) return <div className="wrap"><div className="skel" style={{ marginTop: 24 }} aria-busy="true" /></div>;
  if (listings.isError || vehicles.isError)
    return <div className="wrap" style={{ paddingTop: 24 }}><StatusBanner kind="error" message={friendlyError(listings.error ?? vehicles.error, 'your cars')} /><button className="link" onClick={() => { listings.refetch(); vehicles.refetch(); }}>Try again</button></div>;

  const ls = listings.data ?? []; const listedIds = new Set(ls.map((l) => l.vehicleId));
  const drafts = (vehicles.data ?? []).filter((v) => !listedIds.has(v.id));
  const mine = (trips.data ?? []).filter((t) => t.role === 'owner');
  const asks = mine.filter((t) => t.status === 'requested' && +new Date(t.startDate) > Date.now());
  const upcoming = mine.filter((t) => t.status === 'confirmed' && +new Date(t.endDate) > Date.now());
  const now = new Date(); const monthKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}`;
  const monthNet = mine.filter((t) => t.status === 'confirmed' && (() => { const d = new Date(t.startDate); return `${d.getUTCFullYear()}-${d.getUTCMonth()}` === monthKey; })()).reduce((s, t) => s + ownerNetCents(t.rentalCents), 0);

  if (ls.length === 0 && drafts.length === 0) return (
    <main className="wrap" style={{ maxWidth: 640, paddingTop: 32 }}>
      <h1 style={{ fontSize: 30 }}>Earn from the car you're not using</h1>
      <p>List your car in about five minutes. You choose the price, the rules and who can book.</p>
      <div className="sec" style={{ display: 'grid', gap: 10 }}>
        <div><b>You stay in control.</b> Set your own price, block dates, and pause any time.</div>
        <div><b>Renters are checked.</b> Every renter's ID and licence is verified first.</div>
        <div><b>Trips are protected.</b> Condition photos, a deposit hold and cover on every trip.</div>
        <Link to="/owner/new" className="btn" style={{ textAlign: 'center', textDecoration: 'none' }}>List my car</Link></div>
    </main>);

  return (
    <main className="wrap" style={{ maxWidth: 760, paddingTop: 24 }}>
      <h1 style={{ fontSize: 28 }}>Your cars</h1>
      {cap.hostNeedsAction && (
        <section className="note warn" role="status" style={{ marginTop: 12 }}>
          <b>{cap.host.nextStep === 'identity' ? 'Confirm your identity to go live.' : cap.host.nextStep === 'licence' ? 'Add your driving licence to go live.' : 'We need proof the car is yours before it can go live.'}</b>{' '}
          <Link to="/verify">Continue verification</Link>
        </section>
      )}
      <section className="sec" style={{ background: 'var(--deep)', color: '#fff', border: 0 }}>
        <div style={{ color: '#BFE0E0', fontSize: 13 }}>Booked this month, after our 15% fee</div>
        <div style={{ fontSize: 34, fontWeight: 800 }}>{money(monthNet)}</div>
        <div style={{ color: '#BFE0E0', fontSize: 13 }}>Confirmed trips only. This isn't a payout statement.</div>
      </section>
      {trips.isError && <p className="note warn" role="alert" style={{ marginTop: 12 }}>{friendlyError(trips.error, 'your trips')} <button className="link" onClick={() => trips.refetch()}>Try again</button></p>}
      {asks.length > 0 && (
        <section style={{ marginTop: 16, display: 'grid', gap: 10 }} aria-label="Needs your answer">
          <h2 style={{ fontSize: 20 }}>Needs your answer ({asks.length})</h2>
          {asks.map((t) => <Ask key={t.id} t={t} busy={respond.isPending} onAnswer={(accept) => respond.mutate({ id: t.id, accept })} />)}
          {respond.isError && <p className="note warn" role="alert">{serverMessage(respond.error) ?? friendlyError(respond.error, 'your answer')} Nothing changed. Try again.</p>}
        </section>)}
      {upcoming.length > 0 && (
        <section className="sec" style={{ marginTop: 16 }} aria-label="Upcoming trips"><h2 style={{ fontSize: 18 }}>Coming up</h2>
          {upcoming.map((t) => <Link key={t.id} to={`/trips/${t.id}`} className="line" style={{ textDecoration: 'none' }}><span>{fmt(t.startDate)} to {fmt(t.endDate)}</span><span>You earn {money(ownerNetCents(t.rentalCents), t.currency)}</span></Link>)}</section>)}
      <section style={{ marginTop: 16, display: 'grid', gap: 10 }} aria-label="Cars">
        {ls.map((l) => { const v = l.vehicle; const live = l.status === 'active';
          return (
            <article key={l.id} className="sec" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {v?.photos[0] ? <img src={v.photos[0].url} alt="" style={{ width: 88, height: 66, objectFit: 'cover', borderRadius: 10 }} /> : <div className="skel" style={{ width: 88, height: 66 }} />}
              <div style={{ flex: 1, minWidth: 160 }}><b style={{ color: 'var(--text-h)' }}>{v ? `${v.year} ${v.make} ${v.model}` : 'Your car'}</b><br />
                <span className={`pill ${live ? 'tier-trusted' : 'tier-new'}`}>{live ? 'Live' : l.status === 'paused' ? 'Paused' : 'Not published'}</span> <span className="mut">{money(l.basePriceCents, l.currency)}/day{l.minimumTrustTier ? ` · ${TIER[l.minimumTrustTier] ?? l.minimumTrustTier}+ renters` : ''}</span></div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link to={`/listings/${l.id}`}>See as renter</Link><Link to={`/owner/cars/${l.id}`}>Calendar and price</Link><Link to={`/owner/vehicles/${l.vehicleId}/photos`}>Photos</Link>
                {l.status !== 'draft' && <button className="link" disabled={toggle.isPending} onClick={() => toggle.mutate(l)}>{live ? 'Pause' : 'Go live'}</button>}
                {l.status === 'draft' && <Link to={`/owner/new?vehicleId=${l.vehicleId}&step=preview`}>Finish and publish</Link>}</div>
            </article>); })}
        {toggle.isError && <p className="note warn" role="alert">{serverMessage(toggle.error) ?? friendlyError(toggle.error, 'that change')} It wasn't changed.</p>}
        {drafts.map((v) => (
          <article key={v.id} className="sec" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <span><b style={{ color: 'var(--text-h)' }}>{v.year} {v.make} {v.model}</b><br /><span className="mut">Setup not finished</span></span>
            <Link className="btn" style={{ width: 'auto', textDecoration: 'none', padding: '10px 18px' }} to={`/owner/new?vehicleId=${v.id}&step=${v.photos.length < 3 ? 'photos' : 'details'}`}>Continue setup</Link>
          </article>))}
      </section>
      <p style={{ marginTop: 16 }}><Link to="/owner/new">+ List another car</Link></p>
    </main>
  );
}

function Ask({ t, busy, onAnswer }: { t: Trip; busy: boolean; onAnswer: (accept: boolean) => void }) {
  return (
    <article className="sec" style={{ borderColor: 'var(--gold)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b style={{ color: 'var(--text-h)' }}>{fmt(t.startDate)} to {fmt(t.endDate)} · {t.days} {t.days === 1 ? 'day' : 'days'}</b><b>You earn {money(ownerNetCents(t.rentalCents), t.currency)}</b></div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><span className="tag ok">ID verified</span><span className="tag ok">Licence checked</span>{t.renterTier && <span className="tag">{TIER[t.renterTier] ?? t.renterTier} level</span>}</div>
      <p className="note" style={{ margin: 0 }}>The renter's card is on hold. If you accept, the days are blocked and cover starts. If you decline, the hold is released.</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" disabled={busy} onClick={() => onAnswer(true)}>Accept</button>
        <button className="btn" style={{ background: 'transparent', color: 'var(--text-h)', border: '1px solid var(--border)' }} disabled={busy} onClick={() => { if (confirm('Decline this request? The renter is told and their hold is released.')) onAnswer(false); }}>Decline</button>
      </div>
    </article>
  );
}
