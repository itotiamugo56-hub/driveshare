import { useSearchParams } from 'react-router-dom';
import { useListingSearch } from '../hooks/useVehicleListing';
import { VehicleCard } from '../components/VehicleCard';
import { FilterBar } from '../components/FilterBar';
import { StatusBanner } from '../components/StatusBanner';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useRecentStore } from '../store/recentStore';
import { Link } from 'react-router-dom';
import { NearMe } from '../components/NearMe';
import { HowItWorks } from '../components/RenterHelp';
import { friendlyError } from '../lib/errors';
import type { SearchListingsParams } from '../api/domains/vehicleListing.api';

/**
 * Audit ambition addressed: the feed-based "vehicle hub" screen. Filter/sort
 * state is read from and written to the URL (`useSearchParams`) rather than
 * a new store — this keeps the feed's state shareable/bookmarkable/back-
 * button-safe without introducing a new state-management pattern beyond
 * what the audit's gap (8) required ("no state layer for product data"),
 * which React Query (server cache, see useListingSearch) plus the URL
 * (filter/pagination state) together resolve.
 */
export function VehicleHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  useDocumentTitle('Find a car');
  const recent = useRecentStore((r) => r.cars);

  const params: SearchListingsParams = {
    minPrice: numOrUndefined(searchParams.get('minPrice')),
    maxPrice: numOrUndefined(searchParams.get('maxPrice')),
    deliveryOnly: searchParams.get('deliveryOnly') === 'true' || undefined,
    startDate: searchParams.get('startDate') ?? undefined,
    endDate: searchParams.get('endDate') ?? undefined,
    lat: numOrUndefined(searchParams.get('lat')),
    lng: numOrUndefined(searchParams.get('lng')),
    radiusKm: numOrUndefined(searchParams.get('radiusKm')),
    sort: (searchParams.get('sort') as SearchListingsParams['sort']) ?? undefined,
  };

  const { data, isLoading, isError, error, refetch } = useListingSearch(params);

  const handleFilterChange = (next: SearchListingsParams) => {
    const nextParams = new URLSearchParams();
    if (next.minPrice != null) nextParams.set('minPrice', String(next.minPrice));
    if (next.maxPrice != null) nextParams.set('maxPrice', String(next.maxPrice));
    if (next.deliveryOnly) nextParams.set('deliveryOnly', 'true');
    if (next.startDate) nextParams.set('startDate', next.startDate);
    if (next.endDate) nextParams.set('endDate', next.endDate);
    if (next.lat != null && next.lng != null) {
      nextParams.set('lat', String(next.lat));
      nextParams.set('lng', String(next.lng));
      nextParams.set('radiusKm', String(next.radiusKm ?? 50));
    }
    if (next.sort) nextParams.set('sort', next.sort);
    setSearchParams(nextParams);
  };

  return (
    <>
      <section className="hero">
        <h1>Drive something better, from someone you can trust.</h1>
        <p>Every host has a trust tier, every car is photo-checked, and every trip has cover. Filter by dates and see what you can book.</p>
        <div className="bar"><FilterBar value={params} onChange={handleFilterChange} /><NearMe value={params} onChange={handleFilterChange} /></div>
      </section>
      <div className="pillars" aria-label="Why DriveShare">
        <div><b>Trust tiers</b>New to Elite hosts</div>
        <div><b>Photo baselines</b>Condition recorded up front</div>
        <div><b>Trip cover</b>Three levels to choose from</div>
        <div><b>Keyless pick-up</b>Digital key on your phone</div>
        <div><b>Blind reviews</b>Honest, posted by both sides</div>
      </div>
      <HowItWorks />
      {recent.length > 0 && (
        <nav className="pillars" aria-label="Recently viewed">
          {recent.map((c) => <Link key={c.id} to={`/listings/${c.id}`} style={{ flex: '0 0 auto', textDecoration: 'none' }}><div><b>{c.title}</b>{c.price}</div></Link>)}
        </nav>
      )}
      <main className="wrap">
        {isLoading && (
          <div className="grid" aria-busy="true" aria-label="Loading listings">
            {[0, 1, 2, 3, 4, 5].map((n) => <div key={n} className="skel" />)}
          </div>
        )}
        {isError && (
          <>
            <StatusBanner kind="error" message={friendlyError(error, 'cars')} />
            <button className="link" onClick={() => refetch()} style={{ marginTop: 8 }}>Try again</button>
          </>
        )}
        {data && data.results.length === 0 && (
          <StatusBanner kind="empty" message="No cars match these dates and filters. Widen your dates, raise the price cap, or turn off delivery-only." />
        )}
        {data && data.results.length > 0 && (
          <>
            <p style={{ fontSize: 13, margin: '4px 0 14px' }}>
              <strong style={{ color: 'var(--text-h)' }}>{data.results.length} cars</strong> · Sorted by {data.meta.sortLabel}
            </p>
            <div className="grid">
              {data.results.map((listing) => <VehicleCard key={listing.id} listing={listing} />)}
            </div>
          </>
        )}
      </main>
    </>
  );
}

function numOrUndefined(v: string | null): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
