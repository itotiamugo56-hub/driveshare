import { createBrowserRouter, redirect, type LoaderFunctionArgs } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useAppStore } from './store/appStore';
import { VehicleHubPage } from './pages/VehicleHubPage';
import { ListingDetailPage } from './pages/ListingDetailPage';
import { VehiclePhotoManagerPage } from './pages/VehiclePhotoManagerPage';
import { UserProfilePage } from './pages/UserProfilePage';
import { CompanyProfilePage } from './pages/CompanyProfilePage';
import { ManageCompanyProfilePage } from './pages/ManageCompanyProfilePage';
import { CheckoutPage } from './pages/CheckoutPage';
import { VerifyPage } from './pages/VerifyPage';
import { SavedPage } from './pages/SavedPage';
import { ComparePage } from './pages/ComparePage';
import { RouteError } from './components/RouteError';
import { TripsPage } from './pages/TripsPage';
import { TripDetailPage } from './pages/TripDetailPage';
import { OwnerHomePage } from './pages/OwnerHomePage';
import { ListCarPage } from './pages/ListCarPage';
import { EditListingPage } from './pages/EditListingPage';
import { LoginPage } from './pages/LoginPage';
import { Layout } from './components/SiteHeader';
import { NotFoundPage } from './pages/NotFoundPage';

/** Sends signed-out visitors to sign-in and brings them back to the page they asked for. */
export const requireAuth = ({ request }: LoaderFunctionArgs) => {
  if (!useAuthStore.getState().userId) {
    const u = new URL(request.url);
    throw redirect(`/login?next=${encodeURIComponent(u.pathname + u.search)}`);
  }
  return null;
};

/**
 * Launch routing for the home page:
 *  - signed in: straight in, reopening the area they used last
 *  - signed out and never seen the welcome flow (or signed out on purpose): welcome
 *  - signed out and already onboarded (e.g. session expired): the app, browsable as a visitor
 */
export const homeLoader = ({ request }: LoaderFunctionArgs) => {
  const { userId } = useAuthStore.getState();
  const { onboarded, lastWorkspace } = useAppStore.getState();
  const url = new URL(request.url);
  if (userId) return lastWorkspace === 'host' && url.search === '' && !url.hash ? redirect('/owner') : null;
  // Search links and shared URLs are never interrupted by onboarding.
  if (!onboarded && url.search === '') throw redirect('/welcome');
  return null;
};

/**
 * Audit gap addressed: no routing library or route tree existed — `App.tsx`
 * unconditionally rendered `TestDashboardPage`, by explicit design ("no
 * router, no other route, per the architecture doc's scope boundary").
 * `react-router-dom` was added (see implementation summary — it was not a
 * pre-existing dependency) because a feed + detail-view pattern requires
 * more than one screen and the architecture doc's own stack table already
 * named it as the Phase 2 routing choice.
 *
 * The Test-Runner Dashboard is preserved at `/dev/tests` rather than
 * deleted — it remains the only screen that exercises all 173 backend
 * endpoints end-to-end, and removing it was not an audited gap.
 *
 * `/users/:userId`, `/companies/:companyProfileId`, `/owner/company-profile`
 * added per the verification-check follow-up (individual/company profile
 * gaps). `*` (catch-all) added per Section 2 proposed improvement.
 */
export const router = createBrowserRouter([
  {
    element: <Layout />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <VehicleHubPage />, loader: homeLoader },
      { path: '/host', lazy: async () => ({ Component: (await import('./pages/HostPitchPage')).HostPitchPage }) },
      { path: '/verify', element: <VerifyPage />, loader: requireAuth },
      { path: '/compare', element: <ComparePage /> },
      { path: '/trips', element: <TripsPage />, loader: requireAuth },
      { path: '/trips/:tripId', element: <TripDetailPage />, loader: requireAuth },
      { path: '/owner', element: <OwnerHomePage />, loader: requireAuth },
      { path: '/owner/cars/:listingId', element: <EditListingPage />, loader: requireAuth },
      { path: '/owner/new', element: <ListCarPage />, loader: requireAuth },
      { path: '/saved', element: <SavedPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/listings/:listingId', element: <ListingDetailPage /> },
      { path: '/listings/:listingId/checkout', element: <CheckoutPage /> },
      { path: '/owner/vehicles/:vehicleId/photos', element: <VehiclePhotoManagerPage />, loader: requireAuth },
      { path: '/users/:userId', element: <UserProfilePage /> },
      { path: '/companies/:companyProfileId', element: <CompanyProfilePage /> },
      { path: '/owner/company-profile', element: <ManageCompanyProfilePage />, loader: requireAuth },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  { path: '/welcome', lazy: async () => ({ Component: (await import('./pages/WelcomePage')).WelcomePage }), errorElement: <RouteError /> },
  // The API test runner accepts admin credentials, so it only exists in development builds.
  ...(import.meta.env.DEV
    ? [{ path: '/dev/tests', lazy: async () => ({ Component: (await import('./test-dashboard/TestDashboardPage')).TestDashboardPage }) }]
    : []),
]);
