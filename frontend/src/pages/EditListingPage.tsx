import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ownerApi, type OwnerListing } from '../api/domains/owner.api';
import { useAuthStore } from '../store/authStore';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { friendlyError, serverMessage } from '../lib/errors';
import { money, ownerNetCents, toCents } from '../lib/owner';
import { StatusBanner } from '../components/StatusBanner';

const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const TIERS: [string, string][] = [['new', 'Anyone verified'], ['standard', 'Standard and up'], ['trusted', 'Trusted and up'], ['elite', 'Elite only']];

/** Manage one car after it's live: open or block days, change the price and rules, pause. Every change explains what it affects. */
export function EditListingPage() {
  useDocumentTitle('Manage your car');
  const { listingId } = useParams<{ listingId: string }>();
  const { userId, accessToken: token } = useAuthStore();
  const qc = useQueryClient();
  const listings = useQuery({ queryKey: ['owner-listings', userId], queryFn: () => ownerApi.myListings(token), enabled: !!userId });
  const l = listings.data?.find((x) => x.id === listingId);
  if (!userId) return <Navigate to={`/login?next=/owner/cars/${listingId}`} replace />;
  if (listings.isLoading) return <div className="wrap"><div className="skel" style={{ marginTop: 24 }} aria-busy="true" /></div>;
  if (listings.isError) return <div className="wrap" style={{ paddingTop: 24 }}><StatusBanner kind="error" message={friendlyError(listings.error, 'your car')} /><button className="link" onClick={() => listings.refetch()}>Try again</button></div>;
  if (!l) return <div className="wrap" style={{ paddingTop: 24 }}><StatusBanner kind="empty" message="We couldn't find that car in your account." /><p><Link to="/owner">Back to my cars</Link></p></div>;
  const v = l.vehicle;
  return (
    <main className="wrap" style={{ maxWidth: 680, paddingTop: 24, display: 'grid', gap: 16 }}>
      <div><Link to="/owner">← My cars</Link><h1 style={{ fontSize: 28, margin: '8px 0 0' }}>{v ? `${v.year} ${v.make} ${v.model}` : 'Your car'}</h1></div>
      <CalendarCard listingId={l.id} token={token} />
      <RulesCard l={l} token={token} onSaved={() => qc.invalidateQueries({ queryKey: ['owner-listings'] })} />
      <PauseCard l={l} token={token} onDone={() => qc.invalidateQueries({ queryKey: ['owner-listings'] })} />
    </main>
  );
}

function CalendarCard({ listingId, token }: { listingId: string; token: string | null }) {
  const qc = useQueryClient();
  const cal = useQuery({ queryKey: ['owner-calendar', listingId], queryFn: () => ownerApi.getCalendar(listingId, token) });
  const flip = useMutation({
    mutationFn: (v: { date: string; status: string }) => ownerApi.updateCalendar(listingId, [v], token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['owner-calendar', listingId] }),
  });
  const status = new Map((cal.data ?? []).map((d) => [d.date.slice(0, 10), d.status]));
  const today = new Date(); const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const days = Array.from({ length: 42 }, (_, i) => new Date(+start + i * DAY));
  const lead = start.getUTCDay();
  return (
    <section className="sec" aria-label="Calendar">
      <h2 style={{ fontSize: 18 }}>Calendar</h2>
      <p className="mut" style={{ margin: 0 }}>Tap a day to block it or open it again. Days a renter has booked are locked.</p>
      {cal.isLoading && <div className="skel" style={{ height: 200 }} aria-busy="true" />}
      {cal.isError && <p className="note warn" role="alert">{friendlyError(cal.error, 'your calendar')} <button className="link" onClick={() => cal.refetch()}>Try again</button></p>}
      {cal.data && (
        <div className="cal" style={{ gap: 6 }}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => <b key={i} aria-hidden="true">{w}</b>)}
          {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} aria-hidden="true" style={{ background: 'none' }} />)}
          {days.map((d) => {
            const k = iso(d); const s = status.get(k) ?? 'available'; const booked = s === 'booked'; const blocked = s === 'owner_blocked' || s === 'maintenance_hold';
            const label = `${d.toLocaleDateString([], { month: 'long', day: 'numeric', timeZone: 'UTC' })}, ${booked ? 'booked by a renter' : blocked ? 'blocked by you' : 'open'}`;
            return (
              <button key={k} aria-label={label} aria-pressed={blocked} disabled={booked || flip.isPending} className={booked ? '' : ''}
                style={{ padding: '10px 0', borderRadius: 8, border: '1px solid var(--border)', cursor: booked ? 'not-allowed' : 'pointer',
                  background: booked ? 'var(--accent)' : blocked ? 'repeating-linear-gradient(45deg,var(--border),var(--border) 4px,transparent 4px,transparent 8px)' : 'var(--surface)', color: booked ? '#fff' : 'var(--text-h)' }}
                onClick={() => flip.mutate({ date: k, status: blocked ? 'available' : 'owner_blocked' })}>{d.getUTCDate()}</button>);
          })}
        </div>)}
      {flip.isError && <p className="note warn" role="alert">{serverMessage(flip.error) ?? friendlyError(flip.error, 'that change')} The day wasn't changed.</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}><span className="tag">Open</span><span className="tag">Blocked by you</span><span className="tag" style={{ background: 'var(--accent)', color: '#fff' }}>Booked</span></div>
    </section>
  );
}

function RulesCard({ l, token, onSaved }: { l: OwnerListing; token: string | null; onSaved: () => void }) {
  const init = () => ({ price: String(l.basePriceCents / 100), place: l.locationLabel ?? '', desc: l.description ?? '', instant: l.instantBookEnabled, tier: l.minimumTrustTier ?? 'standard',
    delivery: l.deliveryOptions.delivery, fee: String(l.deliveryOptions.fee ?? 0), radius: String(l.deliveryOptions.radius_km || 10) });
  const [f, setF] = useState(init); const [tried, setTried] = useState(false);
  useEffect(() => setF(init()), [l.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (p: Partial<typeof f>) => setF((d) => ({ ...d, ...p }));
  const cents = toCents(f.price);
  const save = useMutation({
    mutationFn: () => ownerApi.updateListing(l.id, { basePriceCents: cents, locationLabel: f.place.trim(), description: f.desc, instantBookEnabled: f.instant, minimumTrustTier: f.tier,
      deliveryOptions: { delivery: f.delivery, radius_km: f.delivery ? Number(f.radius) || 10 : 0, fee: f.delivery ? Number(f.fee) || 0 : 0 } }, token),
    onSuccess: onSaved,
  });
  const priceErr = tried && cents == null; const placeErr = tried && f.place.trim().length < 2;
  return (
    <section className="sec" aria-label="Price and rules" style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ fontSize: 18 }}>Price and rules</h2>
      <label>Price per day (USD)<input className="field" inputMode="decimal" value={f.price} onChange={(e) => set({ price: e.target.value })} aria-invalid={priceErr} /></label>
      <div className="mut" style={{ fontSize: 13 }}>{cents != null ? <>You earn about {money(ownerNetCents(cents))} a day after the 15% fee. </> : null}A new price applies to new bookings. Trips already booked keep the price the renter agreed to.</div>
      {priceErr && <p className="note warn" role="alert" style={{ margin: 0 }}>Enter a daily price, like 65 or 65.50.</p>}
      <label>Where is the car?<input className="field" value={f.place} onChange={(e) => set({ place: e.target.value })} aria-invalid={placeErr} /></label>
      {placeErr && <p className="note warn" role="alert" style={{ margin: 0 }}>Tell renters where the car is.</p>}
      <label style={{ display: 'flex', gap: 10 }}><input type="checkbox" checked={f.instant} onChange={(e) => set({ instant: e.target.checked })} /><span>Instant Book<br /><span className="mut" style={{ fontSize: 13 }}>{f.instant ? 'Renters book right away.' : "You approve each trip. The renter's card is held until you accept."}</span></span></label>
      <div role="radiogroup" aria-label="Minimum renter level" style={{ display: 'grid', gap: 6 }}>
        {TIERS.map(([v, t]) => <button key={v} role="radio" aria-checked={f.tier === v} className="tier" onClick={() => set({ tier: v })}><b>{t}</b></button>)}</div>
      <label style={{ display: 'flex', gap: 10 }}><input type="checkbox" checked={f.delivery} onChange={(e) => set({ delivery: e.target.checked })} /><span><b>Offer delivery</b></span></label>
      {f.delivery && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label>Fee (USD)<input className="field" inputMode="decimal" value={f.fee} onChange={(e) => set({ fee: e.target.value })} /></label>
        <label>Up to (km)<input className="field" inputMode="numeric" value={f.radius} onChange={(e) => set({ radius: e.target.value })} /></label></div>}
      <label>Description<textarea className="field" rows={3} maxLength={500} value={f.desc} onChange={(e) => set({ desc: e.target.value })} /></label>
      {save.isError && <p className="note warn" role="alert">{serverMessage(save.error) ?? friendlyError(save.error, 'your changes')} Nothing was changed.</p>}
      {save.isSuccess && <p className="note ok" role="status">Saved.</p>}
      <button className="btn" disabled={save.isPending} onClick={() => { setTried(true); if (cents != null && f.place.trim().length >= 2) save.mutate(); }}>{save.isPending ? 'Saving…' : 'Save changes'}</button>
    </section>
  );
}

function PauseCard({ l, token, onDone }: { l: OwnerListing; token: string | null; onDone: () => void }) {
  const live = l.status === 'active';
  const m = useMutation({ mutationFn: () => ownerApi.updateListing(l.id, { status: live ? 'paused' : 'active' }, token), onSuccess: onDone });
  if (l.status === 'draft') return null;
  return (
    <section className="sec" aria-label="Availability to renters">
      <h2 style={{ fontSize: 18 }}>{live ? 'This car is live' : 'This car is paused'}</h2>
      <p className="mut" style={{ marginTop: 0 }}>{live ? 'Pausing hides it from search. Trips already booked are not affected.' : 'Renters can\'t find it until you go live again.'}</p>
      {m.isError && <p className="note warn" role="alert">{serverMessage(m.error) ?? friendlyError(m.error, 'that change')} It wasn't changed.</p>}
      <button className="btn" style={{ background: live ? 'transparent' : undefined, color: live ? 'var(--text-h)' : undefined, border: live ? '1px solid var(--border)' : undefined }} disabled={m.isPending} onClick={() => m.mutate()}>{live ? 'Pause this car' : 'Go live'}</button>
    </section>
  );
}
