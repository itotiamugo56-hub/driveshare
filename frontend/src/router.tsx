import { createBrowserRouter } from 'react-router-dom';
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
      { path: '/', element: <VehicleHubPage /> },
      { path: '/verify', element: <VerifyPage /> },
      { path: '/compare', element: <ComparePage /> },
      { path: '/trips', element: <TripsPage /> },
      { path: '/trips/:tripId', element: <TripDetailPage /> },
      { path: '/owner', element: <OwnerHomePage /> },
      { path: '/owner/cars/:listingId', element: <EditListingPage /> },
      { path: '/owner/new', element: <ListCarPage /> },
      { path: '/saved', element: <SavedPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/listings/:listingId', element: <ListingDetailPage /> },
      { path: '/listings/:listingId/checkout', element: <CheckoutPage /> },
      { path: '/owner/vehicles/:vehicleId/photos', element: <VehiclePhotoManagerPage /> },
      { path: '/users/:userId', element: <UserProfilePage /> },
      { path: '/companies/:companyProfileId', element: <CompanyProfilePage /> },
      { path: '/owner/company-profile', element: <ManageCompanyProfilePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  { path: '/dev/tests', lazy: async () => ({ Component: (await import('./test-dashboard/TestDashboardPage')).TestDashboardPage }) },
]);
