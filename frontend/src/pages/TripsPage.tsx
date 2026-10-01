import { Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { tripsApi } from '../api/domains/trips.api';
import { useAuthStore } from '../store/authStore';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { friendlyError } from '../lib/errors';
import { StatusBanner } from '../components/StatusBanner';

export const STATUS_TEXT = { confirmed: 'Booked', requested: 'Waiting for host', cancelled: 'Cancelled' } as const;

/** My trips: upcoming first, then past, in plain status words. */
export function TripsPage() {
  useDocumentTitle('My trips');
  const { userId, accessToken } = useAuthStore();
  const q = useQuery({ queryKey: ['my-trips', userId], queryFn: () => tripsApi.mine(accessToken), enabled: !!userId });
  if (!userId) return <Navigate to="/login?next=/trips" replace />;
  return (
    <main className="wrap" style={{ maxWidth: 720, paddingTop: 28 }}>
      <h1 style={{ fontSize: 30 }}>My trips</h1>
      {q.isLoading && <div className="skel" style={{ height: 120 }} aria-busy="true" />}
      {q.isError && <><StatusBanner kind="error" message={friendlyError(q.error, 'your trips')} /><button className="link" onClick={() => q.refetch()}>Try again</button></>}
      {q.data?.length === 0 && <div className="note">No trips yet. When you book a car, it shows up here. <Link to="/">Find a car</Link></div>}
      <div style={{ display: 'grid', gap: 10 }}>
        {q.data?.map((t) => (
          <Link key={t.id} to={`/trips/${t.id}`} className="card" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span><b style={{ color: 'var(--text-h)' }}>{new Date(t.startDate).toLocaleDateString()} to {new Date(t.endDate).toLocaleDateString()}</b><br />
              <span style={{ fontSize: 13 }}>{t.role === 'owner' ? 'Your car was booked' : `${t.days} ${t.days === 1 ? 'day' : 'days'}`}</span></span>
            <span style={{ textAlign: 'right' }}><span className={`pill ${t.status === 'cancelled' ? 'tier-new' : t.status === 'confirmed' ? 'tier-trusted' : ''}`}>{STATUS_TEXT[t.status]}</span><br />
              <span className="price" style={{ fontSize: 14 }}>{new Intl.NumberFormat('en-US', { style: 'currency', currency: t.currency }).format(t.totalCents / 100)}</span></span>
          </Link>
        ))}
      </div>
    </main>
  );
}
