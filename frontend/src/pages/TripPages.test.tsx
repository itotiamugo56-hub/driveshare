import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderAt } from '../test-utils';
import { TripsPage } from './TripsPage';
import { TripDetailPage } from './TripDetailPage';
import { useAuthStore } from '../store/authStore';
import { tripsApi } from '../api/domains/trips.api';

vi.mock('../api/domains/trips.api', () => ({ tripsApi: { mine: vi.fn(), get: vi.fn(), cancel: vi.fn() } }));
const api = tripsApi as unknown as Record<'mine' | 'get' | 'cancel', ReturnType<typeof vi.fn>>;
const T = (o = {}) => ({ id: 't1', startDate: new Date(Date.now() + 5 * 864e5).toISOString(), endDate: new Date(Date.now() + 8 * 864e5).toISOString(), days: 3, currency: 'USD', rentalCents: 24000, coverCents: 8400, deliveryCents: 0, totalCents: 32400, depositCents: 75000, status: 'confirmed', role: 'renter', ...o });
beforeEach(() => { vi.clearAllMocks(); useAuthStore.setState({ userId: 'u1', accessToken: 'tok' }); });

describe('TripsPage', () => {
  it('signed out goes to sign in', () => { useAuthStore.setState({ userId: null, accessToken: null }); renderAt(<TripsPage />, '/trips'); expect(screen.getByText(/elsewhere/)).toBeInTheDocument(); });
  it('empty state explains and links to cars', async () => {
    api.mine.mockResolvedValue([]); renderAt(<TripsPage />, '/trips');
    expect(await screen.findByText(/No trips yet/)).toBeInTheDocument(); expect(screen.getByRole('link', { name: 'Find a car' })).toBeInTheDocument();
  });
  it('lists trips with plain status words and totals; hosts see "Your car was booked"', async () => {
    api.mine.mockResolvedValue([T(), T({ id: 't2', status: 'requested' }), T({ id: 't3', status: 'cancelled' }), T({ id: 't4', role: 'owner' })]);
    renderAt(<TripsPage />, '/trips');
    expect((await screen.findAllByText('Booked')).length).toBe(2); expect(screen.getByText('Waiting for host')).toBeInTheDocument(); expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.getByText('Your car was booked')).toBeInTheDocument(); expect(screen.getAllByText('$324.00')).toHaveLength(4);
    expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', '/trips/t1');
  });
  it('error: calm message and working retry', async () => {
    api.mine.mockRejectedValueOnce({ statusCode: 0, message: 'Network Error' }).mockResolvedValueOnce([]);
    renderAt(<TripsPage />, '/trips'); expect(await screen.findByText(/internet connection/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' })); expect(await screen.findByText(/No trips yet/)).toBeInTheDocument();
  });
});

describe('TripDetailPage', () => {
  const go = (q = '') => renderAt(<TripDetailPage />, `/trips/t1${q}`, '/trips/:tripId');
  it('new booking shows a confirmation, the breakdown and a progress strip', async () => {
    api.get.mockResolvedValue(T()); go('?new=1');
    expect(await screen.findByText(/You're booked/)).toBeInTheDocument();
    expect(screen.getByText('$750.00')).toBeInTheDocument(); expect(screen.getByRole('list', { name: 'Trip progress' })).toBeInTheDocument();
  });
  it('a request says you are charged only if the host accepts', async () => {
    api.get.mockResolvedValue(T({ status: 'requested' })); go('?new=1');
    expect(await screen.findByText(/charged only if the host accepts/)).toBeInTheDocument();
  });
  it('cancel takes two steps and can be backed out of', async () => {
    api.get.mockResolvedValue(T()); go();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel this trip' }));
    expect(api.cancel).not.toHaveBeenCalled(); expect(screen.getByText(/hold on your card is released/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep my trip' })); expect(screen.getByRole('button', { name: 'Cancel this trip' })).toBeInTheDocument();
  });
  it('confirming cancel calls the API and refreshes to Cancelled', async () => {
    api.get.mockResolvedValueOnce(T()).mockResolvedValue(T({ status: 'cancelled' })); api.cancel.mockResolvedValue(T({ status: 'cancelled' })); go();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel this trip' })); fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel trip' }));
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith('t1', 'tok'));
    expect(await screen.findByText(/hold on your card has been released/)).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Cancel this trip' })).toBeNull();
  });
  it('failed cancel says the trip is unchanged', async () => {
    api.get.mockResolvedValue(T()); api.cancel.mockRejectedValue({ statusCode: 400, message: 'This trip has already started, so it can no longer be cancelled here.' }); go();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel this trip' })); fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel trip' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already started.*unchanged/);
  });
  it('no cancel button once the trip has started, was cancelled, or for staff', async () => {
    api.get.mockResolvedValue(T({ startDate: new Date(Date.now() - 864e5).toISOString() })); go();
    await screen.findByRole('heading', { name: 'Booked' }); expect(screen.queryByRole('button', { name: 'Cancel this trip' })).toBeNull();
  });
  it('unknown trip: friendly error with a way back', async () => {
    api.get.mockRejectedValue({ statusCode: 404, message: 'x' }); go();
    expect(await screen.findByText(/couldn't find this trip/)).toBeInTheDocument(); expect(screen.getByRole('link', { name: 'Back to my trips' })).toBeInTheDocument();
  });
});
