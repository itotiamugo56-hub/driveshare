import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useListingDetail, useVehiclePublicSummary } from '../hooks/useVehicleListing';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAuthStore } from '../store/authStore';
import { tripsApi } from '../api/domains/trips.api';
import { StatusBanner } from '../components/StatusBanner';
import { CoverPicker, EligibilityCard } from '../components/RenterHelp';
import { PaymentMethods } from '../components/PaymentMethods';
import { DepositNote } from '../components/ListingTrust';
import type { CoverTier } from '../hooks/useRenterCheck';
import { friendlyError, serverMessage, errStatus } from '../lib/errors';

const DAY = 86400000;

/** Review-and-confirm: real totals from the server, three plain confirmations, one button. */
export function CheckoutPage() {
  useDocumentTitle('Review and book');
  const { listingId } = useParams<{ listingId: string }>();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { userId, accessToken } = useAuthStore();
  const listingQ = useListingDetail(listingId);
  const vehicleQ = useVehiclePublicSummary(listingQ.data?.vehicleId);
  const [tier, setTier] = useState<CoverTier | null>(null);
  const [method, setMethod] = useState<string | null>(null);
  const [delivery, setDelivery] = useState(false);
  const [ok, setOk] = useState([false, false, false]);
  const start = sp.get('start') ?? '';
  const end = sp.get('end') ?? '';
  const days = start && end ? Math.round((+new Date(end) - +new Date(start)) / DAY) : 0;

  const input = { listingId: listingId!, startDate: start, endDate: end, coverageTierId: tier?.id ?? '', includeDelivery: delivery };
  const preview = useQuery({
    queryKey: ['trip-preview', input],
    queryFn: () => tripsApi.preview(input, accessToken),
    enabled: !!userId && !!tier && days > 0,
    retry: 0,
  });
  const book = useMutation({
    mutationFn: () => tripsApi.book({
      ...input, paymentMethodId: method!,
      comprehensionAnswers: [{ questionId: 'deductible', answer: 'agreed' }, { questionId: 'deposit', answer: 'agreed' }, { questionId: 'cancellation', answer: 'agreed' }],
    }, accessToken),
    onSuccess: (t) => nav(`/trips/${t.id}?new=1`, { replace: true }),
  });

  if (!userId) return <Navigate to={`/login?next=${encodeURIComponent(`/listings/${listingId}/checkout?start=${start}&end=${end}`)}`} replace />;
  if (listingQ.isLoading) return <div className="wrap"><div className="skel" style={{ marginTop: 24 }} aria-busy="true" /></div>;
  if (listingQ.isError || !listingQ.data)
    return <div className="wrap" style={{ paddingTop: 24 }}><StatusBanner kind="error" message={`${friendlyError(listingQ.error, 'this car')} Nothing was charged.`} /></div>;
  if (days < 1)
    return <div className="wrap" style={{ paddingTop: 24 }}><StatusBanner kind="empty" message="Pick your dates first." /><p><Link to={`/listings/${listingId}`}>Back to the car</Link></p></div>;

  const l = listingQ.data;
  const v = vehicleQ.data;
  const p = preview.data;
  const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: l.currency }).format(cents / 100);
  const until = p ? new Date(p.freeCancellationUntil).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const confirms = p ? [
    `If the car is damaged, I pay the first ${money(tier!.deductibleCents)}. The cover pays the rest.`,
    `${money(p.depositCents)} is held on my card and released after a clean return.`,
    `I can cancel for free until ${until}. Later cancellations are logged as late cancellations.`,
  ] : [];
  const ready = !!p && p.eligibility.eligible && !!method && ok.every(Boolean) && !book.isPending;
  const bookErr = book.error ? (serverMessage(book.error) ?? friendlyError(book.error, 'your booking')) : '';

  return (
    <div className="detail">
      <div style={{ display: 'grid', gap: 18 }}>
        <div>
          <Link to={`/listings/${listingId}?start=${start}&end=${end}`}>← Back to the car</Link>
          <h1 style={{ fontSize: 28, marginTop: 8 }}>Review and book</h1>
          <p>Four quick steps. You are not charged for anything you can't see here.</p>
        </div>
        <section className="sec"><h2 style={{ fontSize: 18 }}>1. Can you book it?</h2><EligibilityCard listingId={l.id} /></section>
        <section className="sec"><h2 style={{ fontSize: 18, marginBottom: 8 }}>2. Choose your cover</h2><CoverPicker currency={l.currency} value={tier?.id} onPick={(t) => { setTier(t); setOk([false, false, false]); }} />
          {l.deliveryOptions.delivery && <label style={{ display: 'flex', gap: 8, marginTop: 10 }}><input type="checkbox" checked={delivery} onChange={(e) => setDelivery(e.target.checked)} /> Deliver the car to me (adds a delivery fee)</label>}</section>
        <section className="sec"><h2 style={{ fontSize: 18, marginBottom: 8 }}>3. How you'll pay</h2><PaymentMethods selected={method} onSelect={setMethod} /><DepositNote /></section>
        <section className="sec"><h2 style={{ fontSize: 18, marginBottom: 8 }}>4. Confirm what you're agreeing to</h2>
          {!p && <p className="note">Choose your cover to see these.</p>}
          {confirms.map((c, i) => (
            <label key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
              <input type="checkbox" checked={ok[i]} onChange={(e) => setOk(ok.map((x, j) => (j === i ? e.target.checked : x)))} /><span>{c}</span>
            </label>
          ))}</section>
      </div>
      <aside className="panel" aria-label="Your trip">
        <h2 style={{ fontSize: 18 }}>{v ? `${v.year} ${v.make} ${v.model}` : 'Your trip'}</h2>
        <p style={{ margin: 0 }}>{start} to {end} · {l.locationLabel ?? 'Location shared after booking'}</p>
        {preview.isLoading && <div className="skel" style={{ height: 130 }} aria-busy="true" />}
        {preview.isError && <div className="note warn" role="alert">{serverMessage(preview.error) ?? friendlyError(preview.error, 'your price')} {errStatus(preview.error) === 409 && <Link to={`/listings/${listingId}`}>Change dates</Link>}</div>}
        {p && (
          <div aria-live="polite">
            <div className="line"><span>{p.days} {p.days === 1 ? 'day' : 'days'} rental</span><span>{money(p.rentalCents)}</span></div>
            <div className="line"><span>Cover ({tier!.name === 'baseline' ? 'Basic' : tier!.name === 'premium' ? 'Complete' : 'Standard'})</span><span>{money(p.coverCents)}</span></div>
            {p.deliveryCents > 0 && <div className="line"><span>Delivery</span><span>{money(p.deliveryCents)}</span></div>}
            <div className="line t"><span>Total</span><span>{money(p.totalCents)}</span></div>
            <div className="line"><span>Deposit hold (returned)</span><span>{money(p.depositCents)}</span></div>
          </div>
        )}
        {bookErr && <div className="note warn" role="alert">{bookErr}{errStatus(book.error) === 409 && <> <Link to={`/listings/${listingId}`}>Change dates</Link></>}</div>}
        <button className="btn" disabled={!ready} onClick={() => book.mutate()}>
          {book.isPending ? 'Booking…' : p?.instantBook === false ? 'Send request to host' : 'Confirm and book'}
        </button>
        {!ready && !book.isPending && <small>{!p ? 'Choose your cover.' : !p.eligibility.eligible ? 'This car needs a higher trust level.' : !method ? 'Choose how you\'ll pay.' : 'Tick the three confirmations.'}</small>}
        <small>{p?.instantBook === false ? 'The host has to accept before you are charged.' : 'Booked instantly. You get a confirmation on the next page.'}</small>
      </aside>
    </div>
  );
}
