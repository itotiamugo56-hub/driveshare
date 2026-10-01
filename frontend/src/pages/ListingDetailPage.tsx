import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useListingDetail, useVehiclePublicSummary, useListingCalendar } from '../hooks/useVehicleListing';
import { PhotoGallery } from '../components/PhotoGallery';
import { TrustBadge } from '../components/TrustBadge';
import { StatusBanner } from '../components/StatusBanner';
import { EligibilityCard, CoverPicker } from '../components/RenterHelp';
import { HostTrust, ConditionCard, DepositNote } from '../components/ListingTrust';
import { ShareButton } from '../components/ShareButton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useRecentStore } from '../store/recentStore';
import { friendlyError } from '../lib/errors';

const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Public listing page: gallery, specs, live availability grid, and a sticky trip-total panel. */
export function ListingDetailPage() {
  const { listingId } = useParams<{ listingId: string }>();
  const listingQuery = useListingDetail(listingId);
  const vehicleQuery = useVehiclePublicSummary(listingQuery.data?.vehicleId);
  const calendarQuery = useListingCalendar(listingId);
  const nav = useNavigate();
  const view = useRecentStore((r) => r.view);
  const sp = useSearchParams()[0];
  const [start, setStart] = useState(sp.get('start') ?? '');
  const [end, setEnd] = useState(sp.get('end') ?? '');

  const vv = vehicleQuery.data;
  const pageTitle = vv ? `${vv.year} ${vv.make} ${vv.model}` : 'Car details';
  useDocumentTitle(pageTitle);
  useEffect(() => {
    if (vv && listingQuery.data)
      view({ id: listingQuery.data.id, title: pageTitle, price: `${(listingQuery.data.basePriceCents / 100).toFixed(2)} ${listingQuery.data.currency}/day`, place: listingQuery.data.locationLabel ?? '' });
  }, [vv, listingQuery.data, pageTitle, view]);

  if (listingQuery.isLoading) return <div className="wrap"><div className="skel" style={{ marginTop: 24 }} aria-busy="true" /></div>;
  if (listingQuery.isError || !listingQuery.data) {
    return <div className="wrap" style={{ paddingTop: 24 }}><StatusBanner kind="error" message={`${friendlyError(listingQuery.error, 'this car')} Go back to all cars to keep browsing.`} /></div>;
  }

  const listing = listingQuery.data;
  const vehicle = vehicleQuery.data;
  const title = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ''}` : 'Listing';
  const daily = listing.basePriceCents / 100;
  const blocked = new Set((calendarQuery.data ?? []).filter((e) => e.status !== 'available').map((e) => e.date.slice(0, 10)));
  const days = start && end ? Math.round((+new Date(end) - +new Date(start)) / DAY) : 0;
  let clash = false;
  for (let i = 0; i < days; i++) if (blocked.has(iso(new Date(+new Date(start) + i * DAY)))) clash = true;
  const valid = days > 0 && !clash;
  const today = new Date();
  const grid = Array.from({ length: 28 }, (_, i) => new Date(+today + i * DAY));
  const money = (n: number) => `${n.toFixed(2)} ${listing.currency}`;

  return (
    <div>
      <div className="wrap" style={{ paddingTop: 16 }}><Link to="/">← All cars</Link></div>
      <div className="detail">
        <div style={{ display: 'grid', gap: 18 }}>
          <div>
            <h1 style={{ fontSize: 30 }}>{title}</h1>
            <p style={{ margin: '4px 0 10px' }}>{listing.locationLabel ?? 'Location shared after booking'}</p>
            <TrustBadge tier={listing.minimumTrustTier} />
            <div style={{ marginTop: 6 }}><ShareButton title={title} /></div>
          </div>
          {vehicleQuery.isLoading && <div className="skel" style={{ height: 320 }} aria-busy="true" />}
          {vehicle && <PhotoGallery photos={vehicle.photos} altText={title} />}
          <section className="sec">
            <h2 style={{ fontSize: 18 }}>About this car</h2>
            {listing.description && <p style={{ lineHeight: 1.6 }}>{listing.description}</p>}
            {vehicle && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {vehicle.seats != null && <span className="tag">{vehicle.seats} seats</span>}
                {vehicle.transmission && <span className="tag">{vehicle.transmission}</span>}
                {vehicle.fuelType && <span className="tag">{vehicle.fuelType}</span>}
                {vehicle.mileageLimitPerDay != null && <span className="tag">{vehicle.mileageLimitPerDay} mi/day</span>}
                {vehicle.features.map((f) => <span key={f} className="tag">{f}</span>)}
              </div>
            )}
            <p style={{ marginBottom: 0 }}><Link to={`/users/${listing.ownerId}`}>Meet your host: reviews and badges</Link></p>
          </section>
          <section className="sec" aria-label="Condition">
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>Condition of the car</h2>
            {listing.vehicleId && <ConditionCard vehicleId={listing.vehicleId} />}
          </section>
          <section className="sec" aria-label="Host">
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>Your host</h2>
            <HostTrust ownerId={listing.ownerId} />
          </section>
          <section className="sec" aria-label="Cover">
            <h2 style={{ fontSize: 18, marginBottom: 4 }}>Cover: what if something goes wrong?</h2>
            <p style={{ marginTop: 0 }}>Pick how much protection you want. Bigger cover means you pay less if there is damage.</p>
            <CoverPicker currency={listing.currency} />
          </section>
          <section className="sec" aria-label="Availability, next 28 days">
            <h2 style={{ fontSize: 18, marginBottom: 10 }}>Availability</h2>
            {calendarQuery.isLoading && <div className="skel" style={{ height: 120 }} aria-busy="true" />}
            {calendarQuery.isError && <StatusBanner kind="error" message={friendlyError(calendarQuery.error, 'availability')} />}
            {calendarQuery.data && (
              <div className="cal">
                {grid.map((d) => {
                  const off = blocked.has(iso(d));
                  return <span key={iso(d)} className={off ? 'x' : ''} title={off ? 'Unavailable' : 'Available'}>{d.getDate()}</span>;
                })}
              </div>
            )}
          </section>
        </div>
        <aside className="panel" aria-label="Trip price">
          <EligibilityCard listingId={listing.id} />
          <div className="price" style={{ fontSize: 26 }}>{money(daily)}<span style={{ fontSize: 13, fontWeight: 400 }}> / day</span></div>
          <label style={{ display: 'block', margin: '12px 0 8px', fontSize: 13 }}>Pick-up date
            <input type="date" min={iso(today)} value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>Return date
            <input type="date" min={start || iso(today)} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
          {clash && <StatusBanner kind="error" message="Some of those days are booked. Pick dates from the open days shown left." />}
          {valid && (
            <div aria-live="polite">
              <div className="line"><span>{days} {days === 1 ? 'day' : 'days'} × {money(daily)}</span><span>{money(daily * days)}</span></div>
              {listing.deliveryOptions.delivery && <div className="line"><span>Delivery (optional)</span><span>{money(listing.deliveryOptions.fee)}</span></div>}
              <div className="line t"><span>Trip subtotal</span><span>{money(daily * days)}</span></div>
            </div>
          )}
          {/* Booking flow route is not in this frontend yet; wire this to the trip/payment endpoints. */}
          <button className="btn" disabled={!valid} onClick={() => nav(`/listings/${listing.id}/checkout?start=${start}&end=${end}`)} style={{ marginTop: 12 }}>{listing.instantBookEnabled ? 'Continue to book' : 'Request to book'}</button>
          {!valid && <p style={{ fontSize: 12, margin: '6px 0 0' }}>Pick both dates to continue.</p>}
          <p style={{ fontSize: 12, marginBottom: 0 }}>{listing.instantBookEnabled ? 'Instant Book: no waiting for host approval.' : 'The host confirms your request.'} You are not charged on this page.</p>
          <DepositNote />
        </aside>
      </div>
    </div>
  );
}
