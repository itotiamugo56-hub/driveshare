import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSavedStore } from '../store/savedStore';

/** The shortlist. Stored on this device, so it works before signing in. */
export function SavedPage() {
  const { cars, remove } = useSavedStore();
  useDocumentTitle('Saved cars');
  const list = Object.values(cars);
  const [pick, setPick] = useState<string[]>([]);
  const flip = (id: string) => setPick((p) => p.includes(id) ? p.filter((x) => x !== id) : p.length < 3 ? [...p, id] : p);
  return (
    <main className="wrap" style={{ maxWidth: 720, paddingTop: 28 }}>
      <h1 style={{ fontSize: 30 }}>Saved cars</h1>
      {list.length === 0 ? (
        <div className="note">Nothing saved yet. Tap the heart on any car to keep it here. Saved cars stay on this device.<p style={{ margin: '8px 0 0' }}><Link to="/">Find cars</Link></p></div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {list.map((c) => (
            <div key={c.id} className="sec" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <input type="checkbox" aria-label={`Compare ${c.title}`} checked={pick.includes(c.id)} onChange={() => flip(c.id)} disabled={!pick.includes(c.id) && pick.length >= 3} />
              <Link to={`/listings/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <b style={{ color: 'var(--text-h)' }}>{c.title}</b><br /><span style={{ fontSize: 13 }}>{c.price}{c.place && ` · ${c.place}`}</span>
              </Link>
              <button className="link" onClick={() => remove(c.id)} aria-label={`Remove ${c.title} from saved`}>Remove</button>
            </div>
          ))}
          {list.length > 1 && (pick.length > 1
            ? <Link className="pillbtn" style={{ justifySelf: 'start' }} to={`/compare?ids=${pick.join(',')}`}>Compare {pick.length} cars</Link>
            : <p className="note" style={{ margin: 0 }}>Tick two or three cars to compare them side by side.</p>)}
          <p style={{ fontSize: 13 }}>Prices may have changed since you saved. Open a car to see today's price.</p>
        </div>
      )}
    </main>
  );
}
