import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogoMark, Wordmark } from '../components/Brand';
import { useAppStore, type Intent } from '../store/appStore';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import discover from '../assets/welcome/discover.webp';
import trust from '../assets/welcome/trust.webp';
import pricing from '../assets/welcome/pricing.webp';
import earn from '../assets/welcome/earn.webp';
import roadtrip from '../assets/welcome/roadtrip.webp';
import topo from '../assets/brand/topo.webp';

interface Slide { key: string; img?: string; kicker: string; title: string; body: string }

const SLIDES: Slide[] = [
  { key: 'discover', img: discover, kicker: 'Explore', title: 'Find the right car, close by.', body: 'Browse real cars from verified hosts near you. You can look around without an account.' },
  { key: 'trust', img: trust, kicker: 'Trust', title: 'Everyone is verified. Every trip is covered.', body: "Renters and hosts are ID- and licence-checked, cars are photographed up front, and every trip comes with cover." },
  { key: 'price', img: pricing, kicker: 'Clear pricing', title: 'See the full price before you commit.', body: "Your total, your cover and the cancellation terms are shown first. You're never charged on a car page." },
  { key: 'earn', img: earn, kicker: 'Hosts', title: 'Your car can earn while it sits.', body: 'Set your own price, choose who can book, pause any time. Cars are checked before they go live.' },
  { key: 'intent', kicker: 'One quick question', title: 'What brings you here?', body: 'This only tailors what we show first. You can do both, and you can change it any time.' },
  { key: 'start', img: roadtrip, kicker: "You're set", title: '', body: '' },
];
const LAST = SLIDES.length - 1;
const INTENT_ROW: { v: Intent; label: string; hint: string }[] = [
  { v: 'rent', label: 'I need a car', hint: 'Browse and book from verified hosts' },
  { v: 'earn', label: 'I want to earn with my car', hint: 'List it once you are verified' },
  { v: 'both', label: 'Both', hint: 'Rent when you need to, host when you can' },
];

const reduced = () => typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * First-run flow. It sells the product in four screens, asks one question, and ends by sending people into the app, with
 * "explore first" as the main action. Nothing here requires an account.
 */
export function WelcomePage() {
  useDocumentTitle('Welcome');
  const nav = useNavigate();
  const finish = useAppStore((s) => s.completeOnboarding);
  const savedIntent = useAppStore((s) => s.intent);
  const [i, setI] = useState(0);
  const [intent, setIntent] = useState<Intent | null>(savedIntent);
  const [intro, setIntro] = useState(() => !reduced());
  const [geo, setGeo] = useState<'idle' | 'asking' | 'granted' | 'denied'>('idle');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!intro) return; const t = setTimeout(() => setIntro(false), 1100); return () => clearTimeout(t); }, [intro]);

  const go = (n: number) => {
    const el = track.current; const to = Math.max(0, Math.min(LAST, n));
    setI(to);
    el?.scrollTo?.({ left: to * el.clientWidth, behavior: reduced() ? 'auto' : 'smooth' });
  };
  const onScroll = () => { const el = track.current; if (el && el.clientWidth) setI(Math.round(el.scrollLeft / el.clientWidth)); };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'ArrowRight') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1); };

  const near = coords ? `?lat=${coords.lat.toFixed(4)}&lng=${coords.lng.toFixed(4)}&radiusKm=50` : '';
  const leave = (to: string) => { finish(intent); nav(to, { replace: true }); };
  const askLocation = () => {
    if (!navigator.geolocation) return setGeo('denied');
    setGeo('asking');
    navigator.geolocation.getCurrentPosition(
      (p) => { setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }); setGeo('granted'); },
      () => setGeo('denied'),
      { timeout: 10_000, maximumAge: 600_000 },
    );
  };

  const hosting = intent === 'earn';
  const s = SLIDES[i];

  return (
    <div className="welcome" onKeyDown={onKey}>
      {intro && <div className="intro" aria-hidden="true"><LogoMark size={96} /></div>}
      <header className="w-top">
        <Wordmark size={28} />
        <button className="w-skip" onClick={() => leave('/')}>Skip</button>
      </header>

      <div className="w-track" ref={track} onScroll={onScroll} role="group" aria-roledescription="carousel" aria-label="Welcome to DriveShare">
        {SLIDES.map((sl, n) => (
          <section key={sl.key} className="w-slide" aria-roledescription="slide" aria-label={`${n + 1} of ${SLIDES.length}`} aria-hidden={n !== i || undefined}
            style={sl.img ? undefined : { backgroundImage: `linear-gradient(rgba(8,79,80,.92),rgba(8,79,80,.96)),url(${topo})`, backgroundSize: 'auto,512px' }}>
            {sl.img && <img className="w-img" src={sl.img} alt="" loading={n === 0 ? 'eager' : 'lazy'} decoding="async" />}
            <div className="w-shade" />
            <div className="w-copy">
              <p className="w-kicker">{sl.kicker}</p>
              {sl.key === 'start' ? (
                <>
                  <h1>{hosting ? 'Create your account to list your car.' : 'Start exploring.'}</h1>
                  <p>{hosting ? "You'll verify your identity, licence and car once, then go live. Take a look around while you set up." : 'Browse as much as you like. You only need an account when you are ready to book.'}</p>
                  <button className="w-geo" onClick={askLocation} disabled={geo === 'asking' || geo === 'granted'}>
                    {geo === 'granted' ? '✓ Showing cars near you' : geo === 'asking' ? 'Locating…' : 'Show cars near me'}
                  </button>
                  {geo === 'denied' && <small role="status">No problem. You can search by place instead.</small>}
                </>
              ) : sl.key === 'intent' ? (
                <>
                  <h2>{sl.title}</h2>
                  <p>{sl.body}</p>
                  <div className="w-choices" role="radiogroup" aria-label="What brings you here?">
                    {INTENT_ROW.map((o) => (
                      <button key={o.v} role="radio" aria-checked={intent === o.v} className="w-choice" onClick={() => setIntent(o.v)}>
                        <b>{o.label}</b><span>{o.hint}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <h2>{sl.title}</h2>
                  <p>{sl.body}</p>
                  {sl.key === 'earn' && <button className="w-link" onClick={() => { setIntent('earn'); go(LAST); }}>I have a car to share</button>}
                </>
              )}
            </div>
          </section>
        ))}
      </div>

      <footer className="w-bar">
        <div className="w-dots" aria-hidden="true">{SLIDES.map((x, n) => <i key={x.key} className={n === i ? 'on' : ''} />)}</div>
        {s.key !== 'start' ? (
          <div className="w-actions">
            {i > 0 ? <button className="w-ghost" onClick={() => go(i - 1)}>Back</button> : <span />}
            <button className="w-main" onClick={() => go(i + 1)} disabled={s.key === 'intent' && !intent}>{s.key === 'intent' && !intent ? 'Choose one' : 'Next'}</button>
          </div>
        ) : (
          <div className="w-final">
            {hosting
              ? <button className="w-main" onClick={() => leave('/login?mode=up&next=%2Fowner%2Fnew')}>Create account and list my car</button>
              : <button className="w-main" onClick={() => leave(`/${near}`)}>Explore cars</button>}
            <div className="w-sub">
              {hosting
                ? <button className="w-ghost" onClick={() => leave(`/${near}`)}>Explore cars first</button>
                : <button className="w-ghost" onClick={() => leave('/login?mode=up')}>Create account</button>}
              <button className="w-ghost" onClick={() => leave('/login')}>Sign in</button>
            </div>
            <p className="w-fine">By continuing you agree you are at least 18. <Link to="/host" onClick={() => finish(intent)}>Learn about hosting</Link></p>
          </div>
        )}
      </footer>
    </div>
  );
}
