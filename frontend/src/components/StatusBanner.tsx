interface StatusBannerProps {
  kind: 'loading' | 'error' | 'empty';
  message: string;
}

/**
 * Minimal shared feedback component. Introduced because React Query's
 * `isLoading`/`isError`/empty-result states need somewhere to render, and
 * no such component existed anywhere in the codebase (there was no
 * `src/components` directory at all prior to this change).
 */
export function StatusBanner({ kind, message }: StatusBannerProps) {
  const color = kind === 'error' ? '#dc2626' : kind === 'loading' ? 'var(--text)' : 'var(--text)';
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      style={{
        padding: '16px',
        borderRadius: 8,
        border: '1px solid var(--border)',
        color,
        background: kind === 'error' ? 'rgba(220, 38, 38, 0.08)' : 'var(--accent-bg)',
        fontSize: 14,
      }}
    >
      {message}
    </div>
  );
}
