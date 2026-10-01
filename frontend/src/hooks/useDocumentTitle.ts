import { useEffect } from 'react';

/** Gives every page a meaningful browser tab title, which also announces page changes to screen readers. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} · DriveShare`;
    return () => { document.title = prev; };
  }, [title]);
}
