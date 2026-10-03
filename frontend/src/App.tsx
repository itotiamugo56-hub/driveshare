import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { SESSION_ENDED_EVENT } from './api/client';
import { endSession, watchOtherTabs } from './lib/session';
import { useAuthStore } from './store/authStore';

/**
 * Mounts the route tree and reacts to the server ending the session: caches are cleared and the person is sent to
 * sign-in with their current page remembered, so nothing they were doing is lost.
 */
export default function App() {
  useEffect(() => {
    const onEnded = () => {
      endSession('expired');
      const here = window.location.pathname + window.location.search;
      void router.navigate(`/login?next=${encodeURIComponent(here)}`, { replace: true });
    };
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);
    const stop = watchOtherTabs();
    // Signed out in another tab: leave any signed-in page here too.
    const unsub = useAuthStore.subscribe((s, prev) => {
      if (prev.userId && !s.userId && /^\/(owner|trips|verify)/.test(window.location.pathname)) void router.navigate('/', { replace: true });
    });
    return () => { window.removeEventListener(SESSION_ENDED_EVENT, onEnded); stop(); unsub(); };
  }, []);
  return <RouterProvider router={router} />;
}
