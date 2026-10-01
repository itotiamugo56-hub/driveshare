import type { SearchListingsParams } from '../api/domains/vehicleListing.api';

interface FilterBarProps {
  value: SearchListingsParams;
  onChange: (next: SearchListingsParams) => void;
}

const SORT_OPTIONS: { value: NonNullable<SearchListingsParams['sort']>; label: string }[] = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'price', label: 'Price: low to high' },
  { value: 'distance', label: 'Distance: nearest first' },
  { value: 'newest', label: 'Newest listings' },
];

/**
 * Audit gap addressed: `searchListings` previously only forwarded `minPrice`,
 * `maxPrice`, and a misnamed `delivery` param — `startDate`/`endDate`,
 * `deliveryOnly`, and `sort` had no UI control anywhere. This bar is the
 * first place any of them is exposed to a user. `lat`/`lng`/`radiusKm` are
 * intentionally not exposed here — see implementation summary (flagged,
 * not guessed at: no geolocation-acquisition UI was an audited gap, and
 * adding one is a product decision, not an architectural one).
 */
export function FilterBar({ value, onChange }: FilterBarProps) {
  const set = (patch: Partial<SearchListingsParams>) => onChange({ ...value, ...patch });

  return (
    <div className="fb">
      <label>
        Min price ($/day)
        <input
          type="number"
          min={0}
          value={value.minPrice != null ? value.minPrice / 100 : ''}
          onChange={(e) => set({ minPrice: e.target.value ? Math.round(Number(e.target.value) * 100) : undefined })}
        />
      </label>
      <label>
        Max price ($/day)
        <input
          type="number"
          min={0}
          value={value.maxPrice != null ? value.maxPrice / 100 : ''}
          onChange={(e) => set({ maxPrice: e.target.value ? Math.round(Number(e.target.value) * 100) : undefined })}
        />
      </label>
      <label>
        Start date
        <input
          type="date"
          value={value.startDate ?? ''}
          onChange={(e) => set({ startDate: e.target.value || undefined })}
        />
      </label>
      <label>
        End date
        <input
          type="date"
          value={value.endDate ?? ''}
          onChange={(e) => set({ endDate: e.target.value || undefined })}
        />
      </label>
      <label className="tgl">
        <input
          type="checkbox"
          checked={!!value.deliveryOnly}
          onChange={(e) => set({ deliveryOnly: e.target.checked || undefined })}
        />
        Delivery only
      </label>
      <label className="wide">
        Sort by
        <select
          value={value.sort ?? 'recommended'}
          onChange={(e) => set({ sort: e.target.value as SearchListingsParams['sort'] })}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}