import { useCapabilities } from '../hooks/useCapabilities';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ownerApi, type VinDecoded } from '../api/domains/owner.api';
import { useVehicle, useAddVehiclePhoto, useRemoveVehiclePhoto, useReorderVehiclePhotos } from '../hooks/useVehicleListing';
import { useAuthStore } from '../store/authStore';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { prepareImage } from '../lib/prepareImage';
import { friendlyError, serverMessage } from '../lib/errors';
import { EMPTY_DRAFT, MIN_PHOTOS, money, ownerNetCents, readiness, toCents, type DraftForm, type StepKey } from '../lib/owner';
import { VehicleCard } from '../components/VehicleCard';
import { ShareButton } from '../components/ShareButton';
import type { ListingSearchResult } from '../api/schemas/vehicleListing.schemas';

const STEPS: { key: StepKey; title: string }[] = [
  { key: 'car', title: 'Your car' }, { key: 'photos', title: 'Photos' }, { key: 'details', title: 'Details' },
  { key: 'price', title: 'Price and rules' }, { key: 'preview', title: 'Preview and publish' },
];
const FEATURES = ['Bluetooth', 'Backup camera', 'Apple CarPlay', 'Android Auto', 'USB charging', 'Sunroof', 'Heated seats', 'Child seat', 'Pet friendly', 'Roof rack'];
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

/** Five short steps from "I have a car" to "it is live". Progress is saved after every step. */
export function ListCarPage() {
  useDocumentTitle('List your car');
  const { userId, accessToken } = useAuthStore();
  const [sp, setSp] = useSearchParams();
  const vehicleId = sp.get('vehicleId') ?? undefined;
  const step = (STEPS.find((s) => s.key === sp.get('step'))?.key ?? 'car') as StepKey;
  const vehicleQ = useVehicle(vehicleId);
  const key = `ds-draft-${vehicleId ?? 'new'}`;
  const [f, setF] = useState<DraftForm>(() => { try { return { ...EMPTY_DRAFT, ...JSON.parse(localStorage.getItem(key) ?? '{}') }; } catch { return EMPTY_DRAFT; } });
  const hydrated = useRef(false);
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(f)); } catch { /* private mode: progress still saved on the server */ } }, [f, key]);
  useEffect(() => {
    const v = vehicleQ.data; if (!v || hydrated.current) return; hydrated.current = true;
    setF((d) => ({ ...d, seats: d.seats || (v.seats ? String(v.seats) : ''), transmission: d.transmission || v.transmission || '', fuelType: d.fuelType || v.fuelType || '',
      mileageLimitPerDay: d.mileageLimitPerDay || (v.mileageLimitPerDay ? String(v.mileageLimitPerDay) : ''), features: d.features.length ? d.features : v.features }));
  }, [vehicleQ.data]);
  const set = (p: Partial<DraftForm>) => setF((d) => ({ ...d, ...p }));
  const go = (s: StepKey, vid = vehicleId) => { setSp({ ...(vid ? { vehicleId: vid } : {}), step: s }); window.scrollTo?.(0, 0); };

  if (!userId) return <Navigate to={`/login?next=${encodeURIComponent('/owner/new')}`} replace />;
  if (step !== 'car' && !vehicleId) return <Navigate to="/owner/new" replace />;
  const idx = STEPS.findIndex((s) => s.key === step);
  const photos = vehicleQ.data?.photos ?? [];

  return (
    <main className="wrap" style={{ maxWidth: 680, paddingTop: 24 }}>
      <div role="progressbar" aria-valuemin={1} aria-valuemax={5} aria-valuenow={idx + 1} aria-label={`Step ${idx + 1} of 5: ${STEPS[idx].title}`}>
        <div className="mut" style={{ fontSize: 13 }}>Step {idx + 1} of 5 · {STEPS[idx].title}</div>
        <div className="wiz" aria-hidden="true">{STEPS.map((x, i) => <i key={x.key} className={i <= idx ? 'd' : ''} />)}</div>
      </div>
      {step === 'car' && <StepCar token={accessToken} vehicleId={vehicleId} vehicle={vehicleQ.data} onDone={(id) => go('photos', id)} />}
      {step === 'photos' && vehicleId && <StepPhotos vehicleId={vehicleId} photos={photos} loading={vehicleQ.isLoading} error={vehicleQ.error} onNext={() => go('details')} onBack={() => go('car')} />}
      {step === 'details' && vehicleId && <StepDetails vehicleId={vehicleId} token={accessToken} f={f} set={set} onNext={() => go('price')} onBack={() => go('photos')} />}
      {step === 'price' && <StepPrice token={accessToken} f={f} set={set} onNext={() => go('preview')} onBack={() => go('details')} />}
      {step === 'preview' && vehicleQ.data && <StepPreview token={accessToken} vehicleId={vehicleId!} vehicle={vehicleQ.data} photoCount={photos.length} f={f} set={set} go={go} />}
      <p style={{ marginTop: 24 }}><Link to="/owner" className="later">Save and finish later <span className="mut">· Your progress is kept.</span></Link></p>
    </main>
  );
}

function Nav({ onBack, onNext, nextLabel = 'Continue', disabled, busy, hint }: { onBack?: () => void; onNext: () => void; nextLabel?: string; disabled?: boolean; busy?: boolean; hint?: string }) {
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
      {hint && <small role="status">{hint}</small>}
      <button className="btn" disabled={disabled || busy} onClick={onNext}>{busy ? 'Saving…' : nextLabel}</button>
      {onBack && <button className="link" onClick={onBack} style={{ justifySelf: 'start' }}>← Back</button>}
    </div>
  );
}

function StepCar({ token, vehicleId, vehicle, onDone }: { token: string | null; vehicleId?: string; vehicle?: { year: number; make: string; model: string }; onDone: (id: string) => void }) {
  const [vin, setVin] = useState(''); const [plate, setPlate] = useState(''); const [found, setFound] = useState<VinDecoded | null>(null); const [msg, setMsg] = useState('');
  const decode = useMutation({ mutationFn: () => ownerApi.decodeVin(vin.trim().toUpperCase(), token), onSuccess: setFound });
  const reg = useMutation({ mutationFn: () => ownerApi.registerVehicle(vin.trim().toUpperCase(), plate.trim(), token), onSuccess: (v) => onDone(v.id) });
  if (vehicleId && vehicle) return (
    <section className="sec" style={{ marginTop: 16 }}><h1 style={{ fontSize: 24 }}>{vehicle.year} {vehicle.make} {vehicle.model}</h1>
      <p>This car is already added. Carry on where you left off.</p><Nav onNext={() => onDone(vehicleId)} nextLabel="Continue to photos" /></section>);
  function find() {
    if (!VIN_RE.test(vin.trim().toUpperCase())) return setMsg('A VIN has 17 letters and numbers (no I, O or Q). You can find it on your dashboard or registration.');
    if (plate.trim().length < 2) return setMsg('Enter your licence plate.');
    setMsg(''); decode.mutate();
  }
  const err = msg || (decode.isError ? (serverMessage(decode.error) ?? friendlyError(decode.error, 'that VIN')) + ' Check it and try again.' : '') || (reg.isError ? (serverMessage(reg.error) ?? friendlyError(reg.error, 'your car')) : '');
  return (
    <section className="sec" style={{ marginTop: 16, display: 'grid', gap: 12 }}>
      <h1 style={{ fontSize: 26 }}>Let's add your car</h1>
      <p style={{ margin: 0 }}>All we need is the VIN and plate. We fill in the rest. It takes about five minutes.</p>
      <label>VIN (17 characters)<input className="field vin" value={vin} onChange={(e) => { setVin(e.target.value); setFound(null); }} autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={17} aria-describedby="carerr" /></label>
      <div className="meter" aria-hidden="true">{Array.from({ length: 17 }, (_, i) => <i key={i} className={i < vin.length ? 'f' : ''} />)}</div>
      <small className="mut" role="status">{vin.length === 17 ? '17 of 17. Ready.' : `${vin.length} of 17`}</small>
      <label>Licence plate<input className="field" value={plate} onChange={(e) => setPlate(e.target.value)} autoComplete="off" /></label>
      {err && <div id="carerr" className="note warn" role="alert" style={{ margin: 0 }}>{err}</div>}
      {!found ? <button className="btn" onClick={find} disabled={decode.isPending}>{decode.isPending ? 'Looking it up…' : 'Find my car'}</button> : (
        <div className="note ok" role="status" style={{ margin: 0 }}>
          <b>We found a {found.year} {found.make} {found.model}{found.trim ? ` ${found.trim}` : ''}.</b> Is that right?
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn" style={{ width: 'auto', padding: '10px 18px' }} disabled={reg.isPending} onClick={() => reg.mutate()}>{reg.isPending ? 'Adding…' : 'Yes, add it'}</button>
            <button className="link" onClick={() => setFound(null)}>No, change the VIN</button></div></div>)}
      <details><summary>Why do you need this?</summary>The VIN confirms the car is real and lets us fill in its make, model and year. Your plate is kept private and is never shown to renters.</details>
    </section>
  );
}

function StepPhotos({ vehicleId, photos, loading, error, onNext, onBack }: { vehicleId: string; photos: { id: string; url: string }[]; loading: boolean; error: unknown; onNext: () => void; onBack: () => void }) {
  const add = useAddVehiclePhoto(vehicleId); const del = useRemoveVehiclePhoto(vehicleId); const order = useReorderVehiclePhotos(vehicleId);
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null); const [failed, setFailed] = useState<string[]>([]); const [note, setNote] = useState('');
  async function pick(files: FileList | null) {
    const all = Array.from(files ?? []); const imgs = all.filter((x) => x.type.startsWith('image/'));
    setNote(imgs.length < all.length ? `${all.length - imgs.length} file(s) skipped because they aren't photos.` : ''); setFailed([]);
    const bad: string[] = [];
    for (let i = 0; i < imgs.length; i++) {
      setProg({ done: i, total: imgs.length });
      try { const p = await prepareImage(imgs[i]); await add.mutateAsync({ photoBase64: p.base64, mimeType: p.mimeType }); } catch { bad.push(imgs[i].name); }
    }
    setProg(null); setFailed(bad);
  }
  const need = Math.max(0, MIN_PHOTOS - photos.length);
  return (
    <section className="sec" style={{ marginTop: 16, display: 'grid', gap: 12 }}>
      <h1 style={{ fontSize: 26 }}>Add photos</h1>
      <p style={{ margin: 0 }}>Cars with good photos get booked more. Add at least {MIN_PHOTOS}. Five or more is best.</p>
      <ul className="mut" style={{ margin: 0, paddingLeft: 18 }}><li>Shoot in daylight, car clean.</li><li>Front, back, both sides, the seats and the dashboard.</li><li>Hold your phone sideways.</li></ul>
      <label className="btn" style={{ textAlign: 'center', cursor: 'pointer' }}>{prog ? `Uploading ${prog.done + 1} of ${prog.total}…` : photos.length ? '+ Add more photos' : '+ Choose photos'}
        <input type="file" accept="image/*" multiple hidden disabled={!!prog} onChange={(e) => { pick(e.target.files); e.target.value = ''; }} /></label>
      {note && <p className="note">{note}</p>}
      {failed.length > 0 && <p className="note warn" role="alert">{failed.length} photo(s) didn't upload: {failed.join(', ')}. Check your connection and add them again. The others are saved.</p>}
      {loading && <div className="skel" style={{ height: 120 }} aria-busy="true" />}
      {!!error && <p className="note warn" role="alert">{friendlyError(error, 'your photos')}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 10 }}>
        {photos.map((p, i) => (
          <figure key={p.id} style={{ margin: 0, display: 'grid', gap: 4 }}>
            <img src={p.url} alt={`Photo ${i + 1}${i === 0 ? ' (cover)' : ''}`} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 10 }} />
            <figcaption style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              {i === 0 ? <b>Cover</b> : <button className="link" onClick={() => order.mutate([p.id, ...photos.filter((x) => x.id !== p.id).map((x) => x.id)])}>Make cover</button>}
              <button className="link" aria-label={`Remove photo ${i + 1}`} onClick={() => del.mutate(p.id)}>Remove</button></figcaption>
          </figure>))}
      </div>
      {(del.isError || order.isError) && <p className="note warn" role="alert">That change didn't save. Try again.</p>}
      <Nav onBack={onBack} onNext={onNext} disabled={need > 0 || !!prog} hint={need > 0 ? `Add ${need} more photo${need === 1 ? '' : 's'} to continue.` : `${photos.length} photos. Looking good.`} />
    </section>
  );
}

function StepDetails({ vehicleId, token, f, set, onNext, onBack }: { vehicleId: string; token: string | null; f: DraftForm; set: (p: Partial<DraftForm>) => void; onNext: () => void; onBack: () => void }) {
  const [tried, setTried] = useState(false);
  const save = useMutation({
    mutationFn: () => ownerApi.updateVehicle(vehicleId, { seats: +f.seats, transmission: f.transmission, fuelType: f.fuelType, features: f.features, ...(f.mileageLimitPerDay ? { mileageLimitPerDay: +f.mileageLimitPerDay } : {}) }, token),
    onSuccess: onNext,
  });
  const miss = { seats: !f.seats, transmission: !f.transmission, fuelType: !f.fuelType };
  const bad = (k: keyof typeof miss) => tried && miss[k];
  const radio = <T extends string>(name: 'transmission' | 'fuelType', opts: [T, string][]) => (
    <div role="radiogroup" aria-label={name === 'transmission' ? 'Gearbox' : 'Fuel'} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {opts.map(([v, l]) => <button key={v} role="radio" aria-checked={f[name] === v} className="tier" onClick={() => set({ [name]: v } as Partial<DraftForm>)}>{l}</button>)}</div>);
  return (
    <section className="sec" style={{ marginTop: 16, display: 'grid', gap: 14 }}>
      <h1 style={{ fontSize: 26 }}>Tell renters about it</h1>
      <p style={{ margin: 0 }}>Renters filter by these, so they matter.</p>
      <label>Seats<select className="field" value={f.seats} onChange={(e) => set({ seats: e.target.value })} aria-invalid={bad('seats')}><option value="">Choose…</option>{[2, 3, 4, 5, 6, 7, 8, 9].map((n) => <option key={n}>{n}</option>)}</select></label>
      <div><b>Gearbox</b>{radio('transmission', [['automatic', 'Automatic'], ['manual', 'Manual']])}</div>
      <div><b>Fuel</b>{radio('fuelType', [['gasoline', 'Petrol'], ['diesel', 'Diesel'], ['hybrid', 'Hybrid'], ['electric', 'Electric']])}</div>
      <label>Daily mileage limit (optional)<select className="field" value={f.mileageLimitPerDay} onChange={(e) => set({ mileageLimitPerDay: e.target.value })}><option value="">No limit</option>{[100, 150, 200, 300].map((n) => <option key={n} value={n}>{n} miles a day</option>)}</select></label>
      <fieldset style={{ border: 0, padding: 0 }}><legend><b>Extras (optional)</b></legend>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>{FEATURES.map((x) => <label key={x} className="chip"><input type="checkbox" checked={f.features.includes(x)} onChange={(e) => set({ features: e.target.checked ? [...f.features, x] : f.features.filter((y) => y !== x) })} /> {x}</label>)}</div></fieldset>
      {tried && Object.values(miss).some(Boolean) && <p className="note warn" role="alert">Please choose {[miss.seats && 'seats', miss.transmission && 'gearbox', miss.fuelType && 'fuel'].filter(Boolean).join(', ')}.</p>}
      {save.isError && <p className="note warn" role="alert">{serverMessage(save.error) ?? friendlyError(save.error, 'your details')} Nothing was lost. Try again.</p>}
      <Nav onBack={onBack} busy={save.isPending} onNext={() => { setTried(true); if (!Object.values(miss).some(Boolean)) save.mutate(); }} />
    </section>
  );
}

function StepPrice({ token, f, set, onNext, onBack }: { token: string | null; f: DraftForm; set: (p: Partial<DraftForm>) => void; onNext: () => void; onBack: () => void }) {
  const [tried, setTried] = useState(false); const [geo, setGeo] = useState('');
  const market = useQuery({ queryKey: ['market-prices'], queryFn: () => ownerApi.marketPrices(token), retry: 0 });
  const cents = toCents(f.price);
  const prices = [...(market.data ?? [])].sort((a, b) => a - b); const median = prices.length >= 3 ? prices[Math.floor(prices.length / 2)] : null;
  const priceErr = tried && cents == null ? 'Enter a daily price, like 65 or 65.50.' : ''; const placeErr = tried && f.locationLabel.trim().length < 2 ? 'Tell renters where the car is, like "Austin, TX".' : '';
  function locate() {
    if (!navigator.geolocation) return setGeo("This browser can't share your location. Type the place instead.");
    navigator.geolocation.getCurrentPosition((p) => { set({ lat: p.coords.latitude, lng: p.coords.longitude }); setGeo('Location saved. Now type the area name renters will see.'); },
      (e) => setGeo(e.code === 1 ? 'Location is switched off for this site. Type the place instead.' : "We couldn't find you. Type the place instead."), { timeout: 10000 });
  }
  const tiers: [DraftForm['minTier'], string, string][] = [['new', 'Anyone verified', 'Most bookings'], ['standard', 'Standard and up', 'Recommended'], ['trusted', 'Trusted and up', 'Fewer, safer bookings'], ['elite', 'Elite only', 'Fewest bookings']];
  return (
    <section className="sec" style={{ marginTop: 16, display: 'grid', gap: 14 }}>
      <h1 style={{ fontSize: 26 }}>Set your price and rules</h1>
      <label>Price per day (USD)<input className="field" inputMode="decimal" value={f.price} onChange={(e) => set({ price: e.target.value })} aria-invalid={!!priceErr} aria-describedby="pricehelp" /></label>
      <div id="pricehelp" className="mut" style={{ fontSize: 13 }}>
        {cents != null && <div><b style={{ color: 'var(--text-h)' }}>You'd earn about {money(ownerNetCents(cents))} a day</b> after the 15% service fee.</div>}
        {median != null && <div>Other cars on DriveShare are around {money(median)} a day.</div>}
        <div>You can change your price any time.</div></div>
      {priceErr && <p className="note warn" role="alert" style={{ margin: 0 }}>{priceErr}</p>}
      <label>Where is the car?<input className="field" placeholder="Austin, TX" value={f.locationLabel} onChange={(e) => set({ locationLabel: e.target.value })} aria-invalid={!!placeErr} /></label>
      <button className="link" style={{ justifySelf: 'start' }} onClick={locate}>📍 Also save my exact position (for "near me" search)</button>
      {geo && <p className="note" role="status" style={{ margin: 0 }}>{geo}</p>}{placeErr && <p className="note warn" role="alert" style={{ margin: 0 }}>{placeErr}</p>}
      <div><b>Booking</b>
        <label style={{ display: 'flex', gap: 10, marginTop: 6 }}><input type="checkbox" checked={f.instantBook} onChange={(e) => set({ instantBook: e.target.checked })} />
          <span>Instant Book<br /><span className="mut" style={{ fontSize: 13 }}>{f.instantBook ? 'Renters book right away. You get more bookings and less messaging.' : 'You approve each trip first. The renter\'s card is held, not charged, until you accept.'}</span></span></label></div>
      <div><b>Who can book?</b>
        <div role="radiogroup" aria-label="Minimum renter level" style={{ display: 'grid', gap: 6, marginTop: 6 }}>
          {tiers.map(([v, l, h]) => <button key={v} role="radio" aria-checked={f.minTier === v} className="tier" onClick={() => set({ minTier: v })}><b>{l}</b><span>{h}</span></button>)}</div>
        <small className="mut">Renter levels come from verified ID, licence, trips and reviews. Everyone is ID-checked first.</small></div>
      <div><label style={{ display: 'flex', gap: 10 }}><input type="checkbox" checked={f.delivery} onChange={(e) => set({ delivery: e.target.checked })} /><span><b>Offer delivery</b><br /><span className="mut" style={{ fontSize: 13 }}>Renters can filter for it. You choose the fee and distance.</span></span></label>
        {f.delivery && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
          <label>Fee (USD)<input className="field" inputMode="decimal" value={f.deliveryFee} onChange={(e) => set({ deliveryFee: e.target.value })} /></label>
          <label>Up to (km)<input className="field" inputMode="numeric" value={f.deliveryRadius} onChange={(e) => set({ deliveryRadius: e.target.value })} /></label></div>}</div>
      <label>Anything renters should know? (optional)<textarea className="field" rows={4} maxLength={500} value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="Fuel rules, pick-up tips, what makes your car nice to drive." /></label>
      <small className="mut">{f.description.length}/500</small>
      <Nav onBack={onBack} onNext={() => { setTried(true); if (cents != null && f.locationLabel.trim().length >= 2) onNext(); }} nextLabel="Preview my listing" />
    </section>
  );
}

function StepPreview({ token, vehicleId, vehicle, photoCount, f, set, go }: { token: string | null; vehicleId: string; vehicle: import('../api/schemas/vehicleListing.schemas').Vehicle; photoCount: number; f: DraftForm; set: (p: Partial<DraftForm>) => void; go: (s: StepKey) => void }) {
  const nav = useNavigate(); const cap = useCapabilities(); const vetBlock = cap.known && !cap.host.canPublish; const checks = readiness(photoCount, f); const ready = checks.every((c) => c.done); const cents = toCents(f.price) ?? 0;
  const fee = Number(f.deliveryFee) || 0;
  const body = { basePriceCents: cents, description: f.description || undefined, locationLabel: f.locationLabel.trim(), locationLat: f.lat, locationLng: f.lng, instantBookEnabled: f.instantBook,
    deliveryOptions: { delivery: f.delivery, radius_km: f.delivery ? Number(f.deliveryRadius) || 10 : 0, fee: f.delivery ? fee : 0 }, minimumTrustTier: f.minTier };
  const [live, setLive] = useState<string | null>(null);
  const publish = useMutation({
    mutationFn: async () => {
      let id = f.listingId;
      if (!id) { id = (await ownerApi.createListing({ vehicleId, ...body }, token)).id; set({ listingId: id }); }
      else await ownerApi.updateListing(id, body, token);
      await ownerApi.updateListing(id, { status: 'active' }, token);
      return id;
    },
    onSuccess: setLive,
  });
  if (live) return (
    <section className="sec" style={{ marginTop: 16 }} role="status">
      <h1 style={{ fontSize: 26 }}>🎉 Your car is live</h1>
      <p>Renters can find it now. We'll tell you the moment someone books or asks.</p>
      <div style={{ display: 'grid', gap: 8 }}>
        <button className="btn" onClick={() => nav(`/listings/${live}`)}>See it as a renter</button>
        <button className="btn" style={{ background: 'transparent', color: 'var(--text-h)', border: '1px solid var(--border)' }} onClick={() => nav('/owner')}>Go to my dashboard</button>
        <ShareButton title={`${vehicle.year} ${vehicle.make} ${vehicle.model}`} /></div>
    </section>);
  const preview = { id: 'preview', basePriceCents: cents, currency: 'USD', description: f.description || null, locationLabel: f.locationLabel, distanceKm: null, instantBookEnabled: f.instantBook,
    deliveryOptions: body.deliveryOptions, minimumTrustTier: f.minTier, ownerAvgRating: null, vehicle: { year: vehicle.year, make: vehicle.make, model: vehicle.model, photos: vehicle.photos } } as unknown as ListingSearchResult;
  return (
    <section style={{ marginTop: 16, display: 'grid', gap: 14 }}>
      <div className="sec"><h1 style={{ fontSize: 26 }}>This is how renters will see it</h1><p style={{ margin: '4px 0 0' }}>Check it over. You can go back to change anything.</p></div>
      <div aria-label="Preview of your listing" onClickCapture={(e) => e.preventDefault()} style={{ maxWidth: 360 }}><VehicleCard listing={preview} /></div>
      <div className="sec"><h2 style={{ fontSize: 18, marginBottom: 6 }}>Before you publish</h2>
        {checks.map((c) => <div key={c.key} className="line"><span>{c.done ? '✓' : '○'} {c.label}</span>{!c.done && <button className="link" onClick={() => go(c.fixStep)}>Fix</button>}</div>)}
        <div className="line"><span>{vetBlock ? '○' : '✓'} Identity, licence and ownership approved</span>{vetBlock && <Link className="link" to="/verify">Verify</Link>}</div>
        <p className="mut" style={{ marginBottom: 0 }}>{ready ? `Renters pay ${money(cents)} a day plus cover. You earn about ${money(ownerNetCents(cents))} a day.` : 'Finish the items above to publish.'}</p></div>
      {publish.isError && <div className="note warn" role="alert">{serverMessage(publish.error) ?? friendlyError(publish.error, 'your listing')} {f.listingId ? 'Your listing is saved. Tap publish to try again.' : 'Nothing was published. Tap publish to try again.'}</div>}
      {ready && vetBlock && <p className="note" role="status" style={{ margin: 0 }}>Your listing is saved as a draft. It goes live as soon as your verification is approved.</p>}
      <button className="btn" disabled={!ready || publish.isPending || vetBlock} onClick={() => publish.mutate()}>{publish.isPending ? 'Publishing…' : vetBlock ? 'Publish after verification' : 'Publish my car'}</button>
      <p className="note" style={{ margin: 0 }}>You can pause or edit your listing at any time from your dashboard.</p>
      <button className="link" onClick={() => go('price')} style={{ justifySelf: 'start' }}>← Back</button>
    </section>
  );
}