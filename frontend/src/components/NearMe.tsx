import { useState } from 'react';
import type { SearchListingsParams } from '../api/domains/vehicleListing.api';

/** "Use my location": asks the browser once, explains any refusal, and lets the renter switch it off again. */
export function NearMe({ value, onChange }: { value: SearchListingsParams; onChange: (n: SearchListingsParams) => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const on = value.lat != null && value.lng != null;

  function locate() {
    if (!navigator.geolocation) return setMsg("This browser can't share your location. Type a place in the search instead.");
    setBusy(true); setMsg('');
    navigator.geolocation.getCurrentPosition(
      (p) => { setBusy(false); onChange({ ...value, lat: p.coords.latitude, lng: p.coords.longitude, radiusKm: 50, sort: 'distance' }); },
      (e) => {
        setBusy(false);
        setMsg(e.code === 1 ? 'Location is switched off for this site. Allow it in your browser settings, then try again.'
          : e.code === 3 ? 'Finding you took too long. Try again.' : "We couldn't find your location. Try again in a moment.");
      },
      { timeout: 10000, maximumAge: 300000 },
    );
  }

  return (
    <div style={{ marginTop: 10, fontSize: 14 }}>
      {on ? (
        <span>Showing cars within {value.radiusKm ?? 50} km of you, nearest first. <button className="link" onClick={() => onChange({ ...value, lat: undefined, lng: undefined, radiusKm: undefined, sort: 'recommended' })}>Show all cars</button></span>
      ) : (
        <button className="link" onClick={locate} disabled={busy}>{busy ? 'Finding you…' : '📍 Show cars near me'}</button>
      )}
      {msg && <p className="note warn" role="alert" style={{ margin: '8px 0 0' }}>{msg}</p>}
    </div>
  );
}
