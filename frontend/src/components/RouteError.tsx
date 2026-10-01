import { Link, useRouteError } from 'react-router-dom';

/** Catches any unexpected crash on a page and offers a way out, instead of a blank screen. */
export function RouteError() {
  const err = useRouteError();
  if (import.meta.env.DEV) console.error(err);
  return (
    <main className="wrap" style={{ maxWidth: 520, paddingTop: 80 }} role="alert">
      <h1 style={{ fontSize: 26 }}>Something went wrong on this page</h1>
      <p>It wasn't anything you did, and nothing was booked or charged. Reload the page, or go back to the cars.</p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button className="btn" style={{ width: 'auto', padding: '12px 22px' }} onClick={() => location.reload()}>Reload page</button>
        <Link to="/">Back to all cars</Link>
      </div>
    </main>
  );
}
