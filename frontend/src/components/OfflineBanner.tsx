import { useEffect, useState } from 'react';

/** Tells the renter when their connection drops, so a failed load is never a mystery. */
export function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  if (online) return null;
  return <div className="offline" role="status">You're offline. Saved cars still work. Everything else returns when your connection does.</div>;
}
