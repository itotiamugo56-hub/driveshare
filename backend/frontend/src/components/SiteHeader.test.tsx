import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { Layout } from './SiteHeader';
import { useAuthStore } from '../store/authStore';
import { useModeStore } from '../store/modeStore';

function mount(path: string) {
  const router = createMemoryRouter(
    [{ element: <Layout />, children: ['/', '/owner', '/users/:id', '/verify', '/trips/:id', '/listings/:id'].map((p) => ({ path: p, element: <div>page {p}</div> })) }],
    { initialEntries: [path] },
  );
  return { ...render(<RouterProvider router={router} />), router };
}
const shell = () => document.querySelector('.shell')!;

describe('Host / Rent mode in the header', () => {
  beforeEach(() => {
    localStorage.clear();
    useModeStore.setState({ mode: 'rent' });
    useAuthStore.setState({ accessToken: 't', userId: 'u1', role: 'user' });
  });

  it('stays in host mode after opening My profile', async () => {
    const { router } = mount('/owner');
    expect(shell().classList.contains('host')).toBe(true);
    fireEvent.click(screen.getAllByRole('link', { name: 'My profile' })[0]);
    expect(router.state.location.pathname).toBe('/users/u1');
    expect(shell().classList.contains('host')).toBe(true);
    expect(screen.getAllByRole('link', { name: 'My cars' }).length).toBeGreaterThan(0);
  });

  it('stays in host mode on Get verified and a trip opened from the dashboard', async () => {
    const { router } = mount('/owner');
    await act(async () => { await router.navigate('/verify'); });
    expect(shell().classList.contains('host')).toBe(true);
    await act(async () => { await router.navigate('/trips/t1'); });
    expect(shell().classList.contains('host')).toBe(true);
  });

  it('a renter stays a renter on shared pages', async () => {
    const { router } = mount('/');
    await act(async () => { await router.navigate('/users/u1'); });
    expect(shell().classList.contains('host')).toBe(false);
  });

  it('switches explicitly with the Rent / Host toggle, and "See as renter" goes to rent', async () => {
    const { router } = mount('/owner');
    await act(async () => { await router.navigate('/users/u1'); });
    fireEvent.click(screen.getByRole('link', { name: 'Rent' }));
    expect(shell().classList.contains('host')).toBe(false);
    fireEvent.click(screen.getByRole('link', { name: 'Host' }));
    expect(shell().classList.contains('host')).toBe(true);
    await act(async () => { await router.navigate('/listings/l1'); });
    expect(shell().classList.contains('host')).toBe(false);
  });

  it('remembers host mode when a shared page is opened directly (refresh)', () => {
    useModeStore.setState({ mode: 'host' });
    mount('/users/u1');
    expect(shell().classList.contains('host')).toBe(true);
  });
});
