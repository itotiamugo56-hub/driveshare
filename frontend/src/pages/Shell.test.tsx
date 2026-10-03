import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from '../components/SiteHeader';
import { HostPitchPage } from './HostPitchPage';
import { WelcomePage } from './WelcomePage';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../store/appStore';
import { ownerApi } from '../api/domains/owner.api';
import { tripsApi } from '../api/domains/trips.api';
import { homeLoader, requireAuth } from '../router';

vi.mock('../api/domains/owner.api', () => ({ ownerApi: { hostingStatus: vi.fn() } }));
vi.mock('../api/domains/trips.api', () => ({ tripsApi: { mine: vi.fn() } }));
const o = ownerApi as unknown as { hostingStatus: ReturnType<typeof vi.fn> };
const t = tripsApi as unknown as { mine: ReturnType<typeof vi.fn> };
const NONE = { ownsVehicles: false, identityVerified: false, licenceValid: false, cars: [], canPublish: false, nextStep: 'none' };

function mount(path: string, routes: any[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
}
const shell = (path = '/') => mount(path, [{ element: <Layout />, children: [{ path: '*', element: <div>page</div> }] }]);

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  useAuthStore.getState().clearSession(); useAppStore.setState({ onboarded: true, intent: null, lastWorkspace: 'rent' });
  o.hostingStatus.mockResolvedValue(NONE); t.mine.mockResolvedValue([]);
});

describe('header: no Rent/Host toggle', () => {
  it('visitors get a sign-in button and nothing about hosting in the top bar', () => {
    shell('/saved');
    expect(screen.getAllByRole('link', { name: 'Sign in' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /^Host$/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Hosting/ })).toBeNull();
  });
  it('a signed-in non-owner is offered the earn pitch in the menu, never a Hosting pill', async () => {
    useAuthStore.getState().setSession({ accessToken: 'a', userId: 'u1', role: 'user' });
    shell();
    fireEvent.click(await screen.findByRole('button', { name: /Account menu/ }));
    expect(screen.getByRole('menuitem', { name: 'Earn with your car' })).toHaveAttribute('href', '/host');
    expect(screen.queryByRole('link', { name: /^Hosting/ })).toBeNull();
  });
  it('an owner sees a Hosting pill with the number of booking requests waiting', async () => {
    useAuthStore.getState().setSession({ accessToken: 'a', userId: 'u1', role: 'user' });
    o.hostingStatus.mockResolvedValue({ ...NONE, ownsVehicles: true, identityVerified: true, licenceValid: true, nextStep: 'ownership', cars: [{ vehicleId: 'v', label: 'x', ownership: 'pending', documentSubmitted: false }] });
    t.mine.mockResolvedValue([{ id: 't1', role: 'owner', status: 'requested', startDate: new Date(Date.now() + 864e5).toISOString() }]);
    shell();
    const pill = await screen.findByRole('link', { name: /Hosting, 1 requests? waiting/ });
    expect(pill).toHaveAttribute('href', '/owner');
  });
  it('sign out ends the session and returns to the welcome flow', async () => {
    useAuthStore.getState().setSession({ accessToken: 'a', userId: 'u1', role: 'user' });
    const r = mount('/', [{ element: <Layout />, children: [{ path: '*', element: <div>page</div> }] }, { path: '/welcome', element: <div>welcome screen</div> }]);
    fireEvent.click(await screen.findByRole('button', { name: /Account menu/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(r.state.location.pathname).toBe('/welcome'));
    expect(useAuthStore.getState().userId).toBeNull();
    expect(useAppStore.getState().onboarded).toBe(false);
  });
});

describe('launch routing', () => {
  const home = (path = '/') => mount(path, [{ path: '/', loader: homeLoader, element: <div>home</div> }, { path: '/welcome', element: <div>welcome screen</div> }, { path: '/owner', element: <div>owner</div> }]);
  it('first-ever launch goes to welcome', async () => { useAppStore.setState({ onboarded: false }); home(); expect(await screen.findByText('welcome screen')).toBeInTheDocument(); });
  it('a shared search link is never interrupted by onboarding', async () => { useAppStore.setState({ onboarded: false }); home('/?lat=1&lng=2'); expect(await screen.findByText('home')).toBeInTheDocument(); });
  it('signed in lands on the app, not welcome', async () => { useAppStore.setState({ onboarded: false }); useAuthStore.getState().setSession({ accessToken: 'a', userId: 'u1', role: 'user' }); home(); expect(await screen.findByText('home')).toBeInTheDocument(); });
  it('signed in reopens the host area if that was last used', async () => { useAppStore.setState({ lastWorkspace: 'host' }); useAuthStore.getState().setSession({ accessToken: 'a', userId: 'u1', role: 'user' }); home(); expect(await screen.findByText('owner')).toBeInTheDocument(); });
  it('onboarded visitors browse freely', async () => { home(); expect(await screen.findByText('home')).toBeInTheDocument(); });
  it('protected pages send visitors to sign-in and remember where they were going', async () => {
    const r = mount('/owner/new?vehicleId=V', [{ path: '/owner/new', loader: requireAuth, element: <div>wizard</div> }, { path: '/login', element: <div>login</div> }]);
    await screen.findByText('login');
    expect(r.state.location.search).toBe(`?next=${encodeURIComponent('/owner/new?vehicleId=V')}`);
  });
});

describe('host pitch', () => {
  it('is public and its earnings estimate follows the sliders, after the 15% fee', () => {
    mount('/host', [{ path: '/host', element: <HostPitchPage /> }]);
    expect(screen.getByRole('status')).toHaveTextContent('$510');
    fireEvent.change(screen.getByLabelText(/Daily price/), { target: { value: '100' } });
    expect(screen.getByRole('status')).toHaveTextContent('$850');
    for (const a of screen.getAllByRole('link', { name: /Create account and list my car/ })) expect(a).toHaveAttribute('href', expect.stringContaining('mode=up'));
  });
});

describe('welcome flow', () => {
  const go = () => mount('/welcome', [{ path: '/welcome', element: <WelcomePage /> }, { path: '*', element: <div>app</div> }]);
  it('cannot continue past the question until one is chosen, then ends in the app', async () => {
    useAppStore.setState({ onboarded: false, intent: null });
    const r = go();
    for (let n = 0; n < 4; n++) fireEvent.click(screen.getAllByRole('button', { name: 'Next' }).at(-1)!);
    expect(screen.getByRole('button', { name: 'Choose one' })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: /I need a car/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Explore cars' }));
    await waitFor(() => expect(r.state.location.pathname).toBe('/'));
    expect(useAppStore.getState()).toMatchObject({ onboarded: true, intent: 'rent' });
  });
  it('skip completes onboarding without an account', async () => {
    useAppStore.setState({ onboarded: false });
    const r = go(); fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(r.state.location.pathname).toBe('/'));
    expect(useAppStore.getState().onboarded).toBe(true);
  });
  it('choosing "earn" ends in account creation that continues into the listing wizard', async () => {
    useAppStore.setState({ onboarded: false });
    const r = go();
    for (let n = 0; n < 3; n++) fireEvent.click(screen.getAllByRole('button', { name: 'Next' }).at(-1)!);
    fireEvent.click(screen.getByRole('button', { name: 'I have a car to share' }));
    fireEvent.click(await screen.findByRole('button', { name: /Create account and list my car/ }));
    await waitFor(() => expect(r.state.location.pathname).toBe('/login'));
    expect(r.state.location.search).toContain('mode=up');
  });
});
