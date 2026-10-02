import { useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tripsApi } from '../api/domains/trips.api';
import { useAuthStore } from '../store/authStore';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { friendlyError, serverMessage } from '../lib/errors';
import { StatusBanner } from '../components/StatusBanner';
import { STATUS_TEXT } from './TripsPage';

/** One trip: what happened, what's next, what it cost, and how to cancel. */
export function TripDetailPage() {
  useDocumentTitle('Your trip');
  const { tripId } = useParams<{ tripId: string }>();
  const isNew = useSearchParams()[0].get('new') === '1';
  const { userId, accessToken } = useAuthStore();
  const qc = useQueryClient();
  const [sure, setSure] = useState(false);
  const q = useQuery({ queryKey: ['trip', tripId], queryFn: () => tripsApi.get(tripId!, accessToken), enabled: !!userId });
  const cancel = useMutation({ mutationFn: () => tripsApi.cancel(tripId!, accessToken), onSuccess: () => { setSure(false); qc.invalidateQueries({ queryKey: ['trip', tripId] }); qc.invalidateQueries({ queryKey: ['my-trips'] }); } });
  if (!userId) return <Navigate to={`/login?next=/trips/${tripId}`} replace />;
  if (q.isLoading) return <div className="wrap"><div className="skel" style={{ marginTop: 24 }} aria-busy="true" /></div>;
  if (q.isError || !q.data) return <div className="wrap" style={{ paddingTop: 24 }}><StatusBanner kind="error" message={friendlyError(q.error, 'this trip')} /><p><Link to="/trips">Back to my trips</Link></p></div>;

  const t = q.data;
  const money = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: t.currency }).format(c / 100);
  const fmt = (d: string) => new Date(d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const steps = [
    { label: t.status === 'requested' ? 'Request sent' : 'Booked', done: true },
    { label: t.status === 'requested' ? 'Host accepts' : `Pick-up ${fmt(t.startDate)}`, done: false },
    { label: `Return ${fmt(t.endDate)}`, done: false },
  ];
  const canCancel = t.status !== 'cancelled' && t.role !== 'staff' && +new Date(t.startDate) > Date.now();

  return (
    <main className="wrap" style={{ maxWidth: 680, paddingTop: 28 }}>
      {t.role === 'owner' ? <Link to="/owner">← My cars</Link> : <Link to="/trips">← My trips</Link>}
      {isNew && t.status !== 'cancelled' && <div className="note ok" role="status" style={{ marginTop: 12 }}>
        {t.status === 'confirmed' ? "You're booked. Nothing more to do until pick-up." : 'Request sent. You are charged only if the host accepts.'}</div>}
      <h1 style={{ fontSize: 28, margin: '12px 0 4px' }}>{STATUS_TEXT[t.status]}</h1>
      <p style={{ marginTop: 0 }}>{fmt(t.startDate)} to {fmt(t.endDate)} · {t.days} {t.days === 1 ? 'day' : 'days'}</p>
      {t.status !== 'cancelled' && (
        <ol style={{ display: 'flex', gap: 8, listStyle: 'none', padding: 0, margin: '16px 0' }} aria-label="Trip progress">
          {steps.map((s) => <li key={s.label} className="sec" style={{ flex: 1, padding: 10, fontSize: 13, borderColor: s.done ? 'var(--ok)' : undefined }}>{s.done ? '✓ ' : ''}{s.label}</li>)}
        </ol>
      )}
      <section className="sec">
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>What you paid</h2>
        <div className="line"><span>Rental</span><span>{money(t.rentalCents)}</span></div>
        <div className="line"><span>Cover</span><span>{money(t.coverCents)}</span></div>
        {t.deliveryCents > 0 && <div className="line"><span>Delivery</span><span>{money(t.deliveryCents)}</span></div>}
        <div className="line t"><span>Total</span><span>{money(t.totalCents)}</span></div>
        <div className="line"><span>Deposit hold (returned after a clean return)</span><span>{money(t.depositCents)}</span></div>
      </section>
      {t.status === 'cancelled' && <p className="note" style={{ marginTop: 14 }}>This trip is cancelled and the hold on your card has been released.</p>}
      {canCancel && (
        <section className="sec" style={{ marginTop: 14 }}>
          {!sure ? <button className="link" onClick={() => setSure(true)}>Cancel this trip</button> : (
            <>
              <p style={{ marginTop: 0 }}>Cancel this trip? The hold on your card is released. Cancelling within 24 hours of pick-up is logged as a late cancellation.</p>
              {cancel.isError && <p className="note warn" role="alert">{serverMessage(cancel.error) ?? friendlyError(cancel.error, 'the cancellation')} Your trip is unchanged.</p>}
              <button className="btn" style={{ width: 'auto', padding: '10px 20px' }} disabled={cancel.isPending} onClick={() => cancel.mutate()}>{cancel.isPending ? 'Cancelling…' : 'Yes, cancel trip'}</button>{' '}
              <button className="link" onClick={() => setSure(false)}>Keep my trip</button>
            </>
          )}
        </section>
      )}
    </main>
  );
}
