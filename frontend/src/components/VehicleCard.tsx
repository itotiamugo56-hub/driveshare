import { Link } from 'react-router-dom';
import type { ListingSearchResult } from '../api/schemas/vehicleListing.schemas';
import { CoverPhoto } from './PhotoGallery';
import { useSavedStore } from '../store/savedStore';
import { TrustBadge } from './TrustBadge';

/** Feed card: photo, price, place, and every trust/convenience signal already on the search row. */
export function VehicleCard({ listing }: { listing: ListingSearchResult }) {
  const coverPhoto = listing.vehicle.photos[0];
  const title = `${listing.vehicle.year} ${listing.vehicle.make} ${listing.vehicle.model}`;
  const priceLabel = `${(listing.basePriceCents / 100).toFixed(2)} ${listing.currency}/day`;
  const delivery = listing.deliveryOptions.delivery;
  const saved = useSavedStore((s) => !!s.cars[listing.id]);
  const toggle = useSavedStore((s) => s.toggle);

  return (
    <div style={{ position: 'relative' }}>
    <button
      className="heart"
      aria-pressed={saved}
      aria-label={`${saved ? 'Remove' : 'Save'} ${title}`}
      onClick={() => toggle({ id: listing.id, title, price: priceLabel, place: listing.locationLabel ?? '' })}
    >{saved ? '♥' : '♡'}</button>
    <Link to={`/listings/${listing.id}`} className="card" aria-label={title}>
      <CoverPhoto photo={coverPhoto} altText={title} />
      <div style={{ marginTop: 12, padding: '0 4px 4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
          <h3 style={{ fontSize: 17 }}>{title}</h3>
          <span className="price" style={{ fontSize: 15 }}>{priceLabel}</span>
        </div>
        {listing.description && (
          <p style={{ fontSize: 13, margin: '6px 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {listing.description}
          </p>
        )}
        <div style={{ fontSize: 12, margin: '6px 0' }}>
          {listing.locationLabel ?? 'Location not set'}
          {listing.distanceKm != null && ` · ${listing.distanceKm.toFixed(1)} km away`}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {listing.instantBookEnabled && <span className="tag ok">Instant Book</span>}
          {delivery && <span className="tag ok">Delivery {listing.deliveryOptions.fee > 0 ? `+${listing.deliveryOptions.fee}` : 'free'}</span>}
        </div>
        <TrustBadge tier={listing.minimumTrustTier} avgRating={listing.ownerAvgRating} />
      </div>
    </Link>
    </div>
  );
}
