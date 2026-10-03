import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { OfflineBanner } from './OfflineBanner';
import { Wordmark } from './Brand';
import { useSavedStore } from '../store/savedStore';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../store/appStore';
import { useCapabilities } from '../hooks/useCapabilities';
import { endSession } from '../lib/session';

const ico = {
  explore: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  saved: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  trips: <><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
  host: <path d="M12 5v14M5 12h14" />,
  cars: <><path d="M3 15v-3l2-5h14l2 5v3" /><circle cx="7.5" cy="16" r="1.8" /><circle cx="16.5" cy="16" r="1.8" /></>,
  biz: <><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M9 8V5h6v3" /></>,
  cmp: <path d="M7 4v16M17 4v16M3 8l4-4 4 4M13 16l4 4 4-4" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></>,
};
const Ico = ({ n }: { n: keyof typeof ico }) => <svg viewBox="0 0 24 24" aria-hidden="true">{ico[n]}</svg>;

/** Avatar with a ring that fills as verification steps are completed. Tapping it opens the account menu. */
function Avatar({ progress }: { progress: number }) {
  const r = 20, c = 2 * Math.PI * r;
  return (
    <span className="avatar" data-complete={progress >= 1 || undefined}>
      <svg viewBox="0 0 48 48" aria-hidden="true" className="ring">
        <circle cx="24" cy="24" r={r} className="ring-bg" />
        <circle cx="24" cy="24" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} transform="rotate(-90 24 24)" />
      </svg>
      <Ico n="user" />
    </span>
  );
}

function AccountMenu() {
  const { userId } = useAuthStore();
  const cap = useCapabilities();
  const nav = useNavigate();
  const here = useLocation();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const inHost = here.pathname.startsWith('/owner');

  useEffect(() => { setOpen(false); }, [here.pathname]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const pct = Math.round(cap.progress * 100);
  const signOut = () => { endSession('logout'); nav('/welcome', { replace: true }); };
  return (
    <div className="acct" ref={box}>
      <button className="avatar-btn" aria-haspopup="menu" aria-expanded={open} aria-label={`Account menu. Verification ${pct}% complete`} onClick={() => setOpen(!open)}>
        <Avatar progress={cap.progress} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <Link role="menuitem" to="/verify" className="mi-verify">
            <span>Verification</span>
            <span className={`pill ${cap.progress >= 1 ? 'tier-trusted' : 'tier-new'}`}>{cap.progress >= 1 ? 'Complete' : `${pct}%`}</span>
          </Link>
          <Link role="menuitem" to={`/users/${userId}`}>My profile</Link>
          <Link role="menuitem" to="/trips">My trips</Link>
          <Link role="menuitem" to="/saved">Saved cars</Link>
          <hr />
          {cap.owns
            ? <Link role="menuitem" to={inHost ? '/' : '/owner'}>{inHost ? 'Switch to renting' : 'Switch to hosting'}</Link>
            : <Link role="menuitem" to="/host">Earn with your car</Link>}
          <hr />
          <button role="menuitem" onClick={signOut}>Sign out</button>
        </div>
      )}
    </div>
  );
}

/**
 * Shared shell. There is no Rent/Host switch: hosting is something a verified owner has, not a mode to toggle.
 * Owners get a contextual "Hosting" pill (with a live count of booking requests); everyone else sees the earn pitch
 * in the account menu, the footer, and onboarding.
 */
export function Layout() {
  const { userId } = useAuthStore();
  const here = useLocation();
  const savedCount = useSavedStore((s) => Object.keys(s.cars).length);
  const setWorkspace = useAppStore((s) => s.setWorkspace);
  const cap = useCapabilities();
  const host = here.pathname.startsWith('/owner');
  const onHome = here.pathname === '/';
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '');

  useEffect(() => { if (userId) setWorkspace(host ? 'host' : 'rent'); }, [host, userId, setWorkspace]);

  const next = encodeURIComponent(here.pathname + here.search);
  const hostingBadge = cap.asks > 0 ? String(cap.asks) : cap.hostNeedsAction ? '!' : null;

  return (
    <div className={`shell ${host ? 'host' : 'rent'}`}>
      <a href="#main" className="skip">Skip to content</a>
      <OfflineBanner />
      <header className="site">
        <Link to="/" className="brand" aria-label="DriveShare home"><Wordmark /></Link>

        {!onHome && (
          <Link to="/#search" className="searchpill" aria-label="Search cars">
            <Ico n="explore" /><span>Where · When · Any car</span>
          </Link>
        )}

        <nav aria-label="Primary" className="primary">
          {host ? (
            <>
              <NavLink end to="/owner" className={cls}>My cars</NavLink>
              <NavLink to="/owner/new" className={cls}>List a car</NavLink>
              <NavLink to="/owner/company-profile" className={cls}>Company</NavLink>
              <Link to="/">Explore cars</Link>
            </>
          ) : (
            <>
              <NavLink end to="/" className={cls}>Explore</NavLink>
              <NavLink to="/compare" className={cls}>Compare</NavLink>
              {userId && <NavLink to="/trips" className={cls}>Trips</NavLink>}
            </>
          )}
        </nav>

        <div className="right">
          <Link to="/saved" className="iconbtn" aria-label={`Saved cars${savedCount ? `, ${savedCount}` : ''}`}>
            <Ico n="saved" />{savedCount > 0 && <span className="badge">{savedCount}</span>}
          </Link>
          {userId ? (
            <>
              {cap.owns && !host && (
                <Link to="/owner" className="hostpill" aria-label={cap.asks ? `Hosting, ${cap.asks} requests waiting` : cap.hostNeedsAction ? 'Hosting, action needed' : 'Hosting'}>
                  Hosting{hostingBadge && <span className="badge inline">{hostingBadge}</span>}
                </Link>
              )}
              <AccountMenu />
            </>
          ) : (
            <Link className="pillbtn" to={`/login?next=${next}`}>Sign in</Link>
          )}
        </div>
      </header>

      <div id="main"><Outlet /></div>

      <nav className="tabbar" aria-label="Main">
        {host ? (
          <>
            <NavLink end to="/owner" className={cls}><Ico n="cars" />My cars</NavLink>
            <NavLink to="/owner/new" className={cls}><Ico n="host" />List a car</NavLink>
            <NavLink to="/owner/company-profile" className={cls}><Ico n="biz" />Company</NavLink>
            <NavLink end to="/" className={cls}><Ico n="explore" />Explore</NavLink>
          </>
        ) : (
          <>
            <NavLink end to="/" className={cls}><Ico n="explore" />Explore</NavLink>
            <NavLink to="/saved" className={cls}><Ico n="saved" />Saved{savedCount > 0 && <span className="badge" aria-label={`${savedCount} saved`}>{savedCount}</span>}</NavLink>
            {userId ? (
              <>
                <NavLink to="/trips" className={cls}><Ico n="trips" />Trips</NavLink>
                {cap.owns
                  ? <NavLink to="/owner" className={cls}><Ico n="cars" />Hosting{hostingBadge && <span className="badge">{hostingBadge}</span>}</NavLink>
                  : <NavLink to={`/users/${userId}`} className={cls}><Ico n="user" />Profile</NavLink>}
              </>
            ) : (
              <>
                <NavLink to="/compare" className={cls}><Ico n="cmp" />Compare</NavLink>
                <NavLink to={`/login?next=${next}`} className={cls}><Ico n="user" />Sign in</NavLink>
              </>
            )}
          </>
        )}
      </nav>

      <footer className="foot">
        <p>Prices are per day. You are never charged on a car page.</p>
        {!cap.owns && <p><Link to="/host">Earn with your car</Link></p>}
      </footer>
    </div>
  );
}
