import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useCapabilities } from '../hooks/useCapabilities';
import { ownerNetCents, money, PLATFORM_FEE_BPS } from '../lib/owner';
import earn from '../assets/welcome/earn.webp';
import protect from '../assets/welcome/protect.webp';
import handover from '../assets/welcome/handover.webp';
import topo from '../assets/brand/topo.webp';

const STEPS = [
  { t: 'Confirm who you are', d: 'A photo of your ID and a quick selfie. Done once.' },
  { t: 'Add your driving licence', d: 'We check it is valid and not expired.' },
  { t: 'Prove the car is yours', d: "Upload the registration or logbook. We check it against the VIN and plate." },
  { t: 'Add photos and a price', d: 'At least three photos, your daily price and where the car is.' },
  { t: 'Go live', d: 'Once your documents are approved, your car appears to renters.' },
];

/** Public pitch for hosts: what it earns, what protects them, and exactly what vetting involves. No account needed. */
export function HostPitchPage() {
  useDocumentTitle('Earn with your car');
  const cap = useCapabilities();
  const [daily, setDaily] = useState(60);
  const [days, setDays] = useState(10);
  const gross = daily * 100 * days;
  const net = useMemo(() => ownerNetCents(gross), [gross]);
  const cta = cap.owns ? { to: '/owner', label: 'Open my host dashboard' } : cap.signedIn ? { to: '/owner/new', label: 'List my car' } : { to: '/login?mode=up&next=%2Fowner%2Fnew', label: 'Create account and list my car' };

  return (
    <main>
      <section className="hostpitch" style={{ backgroundImage: `linear-gradient(rgba(38,34,107,.86),rgba(30,27,75,.95)),url(${topo})`, backgroundSize: 'auto,512px' }}>
        <div className="wrap">
          <p className="w-kicker">For car owners</p>
          <h1>Your car can earn while it sits.</h1>
          <p>You set the price and the rules. Renters are ID- and licence-checked, and trips are covered.</p>
          <Link className="btn heroBtn" to={cta.to}>{cta.label}</Link>
        </div>
      </section>

      <div className="wrap" style={{ maxWidth: 900, paddingTop: 24 }}>
        <section className="sec calc" aria-labelledby="calc-h">
          <h2 id="calc-h" style={{ fontSize: 22 }}>What could you earn?</h2>
          <label>Daily price: <b>{money(daily * 100)}</b>
            <input type="range" min={20} max={300} step={5} value={daily} onChange={(e) => setDaily(+e.target.value)} />
          </label>
          <label>Days booked per month: <b>{days}</b>
            <input type="range" min={1} max={30} value={days} onChange={(e) => setDays(+e.target.value)} />
          </label>
          <div className="calc-out" role="status" aria-live="polite">
            <span>You could earn about</span>
            <b>{money(net)}<small> / month</small></b>
            <span>after our {PLATFORM_FEE_BPS / 100}% fee. An estimate only: actual bookings and prices vary.</span>
          </div>
        </section>

        <div className="trio">
          {[{ img: protect, t: 'Cars are checked', d: 'Every car is photographed and its ownership verified before it goes live.' },
            { img: handover, t: 'You choose who books', d: 'Set a minimum trust level, accept or decline each request, pause any time.' },
            { img: earn, t: 'Trips are protected', d: 'Condition photos, a deposit hold and cover on every trip.' }].map((c) => (
            <article key={c.t} className="sec trio-card"><img src={c.img} alt="" loading="lazy" /><h3>{c.t}</h3><p>{c.d}</p></article>
          ))}
        </div>

        <section className="sec" aria-labelledby="vet-h">
          <h2 id="vet-h" style={{ fontSize: 22 }}>How becoming a host works</h2>
          <p>You can browse and start setting up straight away. A car only goes live once you are verified, so renters can trust every listing.</p>
          <ol className="vet">
            {STEPS.map((s, n) => <li key={s.t}><span>{n + 1}</span><div><b>{s.t}</b><p>{s.d}</p></div></li>)}
          </ol>
          <Link className="btn" style={{ textDecoration: 'none', textAlign: 'center', display: 'block' }} to={cta.to}>{cta.label}</Link>
        </section>
      </div>
    </main>
  );
}
