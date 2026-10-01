import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderAt } from '../test-utils';
import { EditListingPage } from './EditListingPage';
import { useAuthStore } from '../store/authStore';
import { ownerApi } from '../api/domains/owner.api';

vi.mock('../api/domains/owner.api', () => ({ ownerApi: { myListings: vi.fn(), getCalendar: vi.fn(), updateCalendar: vi.fn(), updateListing: vi.fn() } }));
const o = ownerApi as unknown as Record<string, ReturnType<typeof vi.fn>>;
const L = (x: object = {}) => ({ id: 'L1', vehicleId: 'V', basePriceCents: 8000, currency: 'USD', status: 'active', instantBookEnabled: true, minimumTrustTier: 'standard', locationLabel: 'Austin, TX', description: 'Nice',
  deliveryOptions: { delivery: false, radius_km: 0, fee: 0 }, vehicle: { year: 2022, make: 'Honda', model: 'Accord' }, ...x });
const day = (n: number) => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + n));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const go = () => renderAt(<EditListingPage />, '/owner/cars/L1', '/owner/cars/:listingId');
beforeEach(() => { vi.clearAllMocks(); useAuthStore.setState({ userId: 'u1', accessToken: 'tok' }); o.myListings.mockResolvedValue([L()]); o.getCalendar.mockResolvedValue([]); });

describe('EditListingPage', () => {
  it('signed out goes to sign in; an unknown car gets a friendly dead end', async () => {
    useAuthStore.setState({ userId: null, accessToken: null }); const a = go(); expect(screen.getByText(/elsewhere/)).toBeInTheDocument(); a.unmount();
    useAuthStore.setState({ userId: 'u1', accessToken: 'tok' }); o.myListings.mockResolvedValue([]); go();
    expect(await screen.findByText(/couldn't find that car/)).toBeInTheDocument(); expect(screen.getByRole('link', { name: 'Back to my cars' })).toBeInTheDocument();
  });
  it('tapping an open day blocks it; tapping a blocked day opens it', async () => {
    o.getCalendar.mockResolvedValue([{ date: iso(day(2)), status: 'owner_blocked' }]); o.updateCalendar.mockResolvedValue([]); go();
    const open = await screen.findByRole('button', { name: new RegExp(`${day(1).toLocaleDateString([], { month: 'long', day: 'numeric', timeZone: 'UTC' })}, open`) });
    fireEvent.click(open); await waitFor(() => expect(o.updateCalendar).toHaveBeenCalledWith('L1', [{ date: iso(day(1)), status: 'owner_blocked' }], 'tok'));
    const blocked = screen.getByRole('button', { name: /blocked by you/ }); expect(blocked).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(blocked); await waitFor(() => expect(o.updateCalendar).toHaveBeenLastCalledWith('L1', [{ date: iso(day(2)), status: 'available' }], 'tok'));
  });
  it('a day booked by a renter is locked and says so', async () => {
    o.getCalendar.mockResolvedValue([{ date: iso(day(3)), status: 'booked' }]); go();
    const b = await screen.findByRole('button', { name: /booked by a renter/ }); expect(b).toBeDisabled(); fireEvent.click(b); expect(o.updateCalendar).not.toHaveBeenCalled();
  });
  it('a refused change shows the server sentence and says the day was not changed', async () => {
    o.updateCalendar.mockRejectedValue({ statusCode: 409, message: '2026-10-06 is booked by a renter. Cancel that trip first if you need the day back.' }); go();
    fireEvent.click((await screen.findAllByRole('button', { name: /, open/ }))[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent(/booked by a renter.*wasn't changed/);
  });
  it('calendar load failure has a retry', async () => {
    o.getCalendar.mockRejectedValueOnce({ statusCode: 0, message: 'Network Error' }).mockResolvedValue([]); go();
    expect(await screen.findByText(/internet connection/)).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Try again' })); expect((await screen.findAllByRole('button', { name: /, open/ })).length).toBeGreaterThan(20);
  });
  it('prefills the rules, shows net earnings, and says a new price only affects new bookings', async () => {
    go(); expect(await screen.findByLabelText(/Price per day/)).toHaveValue('80'); expect(screen.getByText(/earn about \$68\.00 a day/)).toBeInTheDocument(); expect(screen.getByText(/Trips already booked keep the price/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Standard and up' })).toHaveAttribute('aria-checked', 'true');
  });
  it('validates before saving, then saves the right payload', async () => {
    o.updateListing.mockResolvedValue({}); go(); const price = await screen.findByLabelText(/Price per day/);
    fireEvent.change(price, { target: { value: 'free' } }); fireEvent.click(screen.getByRole('button', { name: 'Save changes' })); expect(screen.getByRole('alert')).toHaveTextContent(/daily price/); expect(o.updateListing).not.toHaveBeenCalled();
    fireEvent.change(price, { target: { value: '95.50' } }); fireEvent.click(screen.getByLabelText(/Instant Book/)); fireEvent.click(screen.getByRole('radio', { name: 'Trusted and up' })); fireEvent.click(screen.getByLabelText(/Offer delivery/));
    fireEvent.change(screen.getByLabelText('Fee (USD)'), { target: { value: '12' } }); fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(o.updateListing).toHaveBeenCalledWith('L1', expect.objectContaining({ basePriceCents: 9550, instantBookEnabled: false, minimumTrustTier: 'trusted', deliveryOptions: { delivery: true, radius_km: 10, fee: 12 } }), 'tok'));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });
  it('a failed save says nothing changed', async () => {
    o.updateListing.mockRejectedValue({ statusCode: 500, message: 'x' }); go(); fireEvent.click(await screen.findByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Nothing was changed/);
  });
  it('pause and go-live explain their effect and call the API', async () => {
    o.updateListing.mockResolvedValue({}); go(); expect(await screen.findByText(/Trips already booked are not affected/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pause this car' })); await waitFor(() => expect(o.updateListing).toHaveBeenCalledWith('L1', { status: 'paused' }, 'tok'));
  });
  it('a paused car offers Go live; a draft offers no pause control', async () => {
    o.myListings.mockResolvedValue([L({ status: 'paused' })]); const a = go(); expect(await screen.findByRole('button', { name: 'Go live' })).toBeInTheDocument(); a.unmount();
    o.myListings.mockResolvedValue([L({ status: 'draft' })]); go(); await screen.findByText('Calendar'); expect(screen.queryByRole('button', { name: /Pause|Go live/ })).toBeNull();
  });
});
