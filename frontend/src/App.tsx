import { RouterProvider } from 'react-router-dom';
import { router } from './router';

/**
 * Audit gap addressed: previously mounted only `TestDashboardPage`, with no
 * router. Now delegates to the route tree in `router.tsx`, which is what the
 * "vehicle hub" feed, listing detail, and owner photo-management screens are
 * reachable through. `TestDashboardPage` remains reachable at `/dev/tests`
 * (see router.tsx) rather than being removed.
 */
export default function App() {
  return <RouterProvider router={router} />;
}
