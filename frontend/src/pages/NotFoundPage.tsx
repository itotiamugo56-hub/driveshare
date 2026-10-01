import { Link } from 'react-router-dom';

/**
 * Section 2 proposed improvement, implemented as listed: the router had no
 * fallback for an unmatched path. Without this, a bad/removed listing link
 * or a typo'd `/users/:id` renders a blank page instead of a usable one.
 */
export function NotFoundPage() {
  return (
    <div style={{ maxWidth: 500, margin: '80px auto', padding: 24, textAlign: 'center' }}>
      <h1 style={{ fontSize: 22 }}>Page not found</h1>
      <p style={{ fontSize: 14, color: 'var(--text)', marginTop: 8 }}>
        The page you're looking for doesn't exist or may have been removed.
      </p>
      <Link to="/" style={{ display: 'inline-block', marginTop: 16, color: 'var(--accent)' }}>
        ← Back to Vehicle Hub
      </Link>
    </div>
  );
}
