import { useState } from 'react';

/** Share a car with a friend or co-driver: native share sheet where available, copied link elsewhere. */
export function ShareButton({ title }: { title: string }) {
  const [note, setNote] = useState('');
  async function share() {
    const url = location.href;
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url);
      setNote('Link copied.');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setNote("Couldn't share. Copy the link from your address bar.");
    }
    setTimeout(() => setNote(''), 4000);
  }
  return (
    <span>
      <button className="link" onClick={share}>Share this car</button>
      <span role="status" style={{ marginLeft: 8, fontSize: 13 }}>{note}</span>
    </span>
  );
}
