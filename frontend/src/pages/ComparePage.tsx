import { Link, useSearchParams } from 'react-router-dom';
import { useListingDetail, useVehiclePublicSummary } from '../hooks/useVehicleListing';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { StatusBanner } from '../components/StatusBanner';
import { CoverPhoto } from '../components/PhotoGallery';
import { TrustBadge } from '../components/TrustBadge';
import { friendlyError } from '../lib/errors';

function Column({ id }: { id: string }) {
  const l = useListingDetail(id);
  const v = useVehiclePublicSummary(l.data?.vehicleId);
  if (l.isLoading) return <div className="skel" style={{ height: 380 }} aria-busy="true" />;
  if (l.isError || !l.data)
    return <div className="sec"><StatusBanner kind="error" message={`${friendlyError(l.error, 'this car')} It may have been removed.`} /></div>;
  const x = l.data;
  const title = v.data ? `${v.data.year} ${v.data.make} ${v.data.model}` : 'Car';
  const rows: [string, string][] = [
    ['Price', `${(x.basePriceCents / 100).toFixed(2)} ${x.currency}/day`],
    ['Where', x.locationLabel ?? 'Shared after booking'],
    ['Seats', v.data?.seats != null ? String(v.data.seats) : 'Not listed'],
    ['Gearbox', v.data?.transmission ?? 'Not listed'],
    ['Fuel', v.data?.fuelType ?? 'Not listed'],
    ['Daily mileage', v.data?.mileageLimitPerDay != null ? `${v.data.mileageLimitPerDay} mi` : 'Not listed'],
    ['Instant Book', x.instantBookEnabled ? 'Yes' : 'Host approves each trip'],
    ['Delivery', x.deliveryOptions.delivery ? `Yes, fee ${x.deliveryOptions.fee}` : 'No'],
  ];
  return (
    <article className="sec cmpcol">
      <CoverPhoto photo={v.data?.photos[0]} altText={title} />
      <h2 style={{ fontSize: 18, margin: '10px 0 6px' }}>{title}</h2>
      <TrustBadge tier={x.minimumTrustTier} />
      <dl style={{ margin: '10px 0' }}>
        {rows.map(([k, val]) => <div key={k} className="line"><dt>{k}</dt><dd style={{ margin: 0, textAlign: 'right', color: 'var(--text-h)' }}>{val}</dd></div>)}
      </dl>
      <Link to={`/listings/${id}`}>Open this car</Link>
    </article>
  );
}

/** Side-by-side comparison of two or three saved cars. */
export function ComparePage() {
  useDocumentTitle('Compare cars');
  const ids = (useSearchParams()[0].get('ids') ?? '').split(',').filter(Boolean).slice(0, 3);
  if (ids.length < 2)
    return <main className="wrap" style={{ paddingTop: 28 }}><StatusBanner kind="empty" message="Pick two or three saved cars to compare them." /><p><Link to="/saved">Go to saved cars</Link></p></main>;
  return (
    <main className="wrap" style={{ paddingTop: 28 }}>
      <h1 style={{ fontSize: 30, marginBottom: 14 }}>Compare cars</h1>
      <div className="cmp">{ids.map((id) => <Column key={id} id={id} />)}</div>
      <p><Link to="/saved">← Back to saved cars</Link></p>
    </main>
  );
}
