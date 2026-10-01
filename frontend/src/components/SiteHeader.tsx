import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { OfflineBanner } from './OfflineBanner';
import { useSavedStore } from '../store/savedStore';
import { useAuthStore } from '../store/authStore';

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

/** Shared shell: brand, a Rent / Host mode switch, and a tab bar that changes with the mode and sign-in state. */
export function Layout() {
  const { userId, logout } = useAuthStore();
  const here = useLocation();
  const savedCount = useSavedStore((s) => Object.keys(s.cars).length);
  const host = here.pathname.startsWith('/owner');
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '');
  return (
    <div className={`shell ${host ? 'host' : 'rent'}`}>
      <a href="#main" className="skip">Skip to content</a>
      <OfflineBanner />
      <header className="site">
        <Link to="/" className="brand">DriveShare</Link>
        <div className="mode" role="group" aria-label="Switch between renting and hosting">
          <Link to="/" className={host ? '' : 'on'} aria-current={host ? undefined : 'true'}>Rent</Link>
          <Link to="/owner" className={host ? 'on' : ''} aria-current={host ? 'true' : undefined}>Host</Link>
        </div>
        <nav aria-label="Account">
          {host ? (
            userId ? (
              <>
                <Link to="/owner">My cars</Link>
                <Link to="/owner/new">List a car</Link>
                <Link to="/owner/company-profile">Company profile</Link>
                <Link to={`/users/${userId}`}>My profile</Link>
                <button className="link" onClick={logout}>Sign out</button>
              </>
            ) : (
              <>
                <Link to="/owner/new">List your car</Link>
                <Link className="pillbtn" to={`/login?next=${encodeURIComponent(here.pathname)}`}>Sign in</Link>
              </>
            )
          ) : (
            <>
              <Link to="/saved">Saved{savedCount > 0 ? ` (${savedCount})` : ''}</Link>
              {userId ? (
                <>
                  <Link to="/trips">My trips</Link>
                  <Link to="/verify">Get verified</Link>
                  <Link to={`/users/${userId}`}>My profile</Link>
                  <button className="link" onClick={logout}>Sign out</button>
                </>
              ) : (
                <Link className="pillbtn" to={`/login?next=${encodeURIComponent(here.pathname)}`}>Sign in</Link>
              )}
            </>
          )}
        </nav>
        {userId && (
          <details className="acct">
            <summary aria-label="Account menu"><Ico n="user" /></summary>
            <div className="menu">
              <Link to="/verify">Get verified</Link>
              <button onClick={logout}>Sign out</button>
            </div>
          </details>
        )}
      </header>
      <div id="main"><Outlet /></div>
      <nav className="tabbar" aria-label="Main">
        {host ? (
          userId ? (
            <>
              <NavLink end to="/owner" className={cls}><Ico n="cars" />My cars</NavLink>
              <NavLink to="/owner/new" className={cls}><Ico n="host" />List a car</NavLink>
              <NavLink to="/owner/company-profile" className={cls}><Ico n="biz" />Company</NavLink>
              <NavLink to={`/users/${userId}`} className={cls}><Ico n="user" />Profile</NavLink>
            </>
          ) : (
            <>
              <NavLink end to="/owner" className={cls}><Ico n="cars" />Earn</NavLink>
              <NavLink to="/owner/new" className={cls}><Ico n="host" />List a car</NavLink>
              <NavLink to="/login" className={cls}><Ico n="user" />Sign in</NavLink>
            </>
          )
        ) : (
          <>
            <NavLink end to="/" className={cls}><Ico n="explore" />Explore</NavLink>
            <NavLink to="/saved" className={cls}><Ico n="saved" />Saved{savedCount > 0 && <span className="badge" aria-label={`${savedCount} saved`}>{savedCount}</span>}</NavLink>
            {userId ? (
              <>
                <NavLink to="/trips" className={cls}><Ico n="trips" />Trips</NavLink>
                <NavLink to={`/users/${userId}`} className={cls}><Ico n="user" />Profile</NavLink>
              </>
            ) : (
              <>
                <NavLink to="/compare" className={cls}><Ico n="cmp" />Compare</NavLink>
                <NavLink to="/login" className={cls}><Ico n="user" />Sign in</NavLink>
              </>
            )}
          </>
        )}
      </nav>
      <footer className="foot">Prices are per day. You are never charged on a car page.</footer>
    </div>
  );
}