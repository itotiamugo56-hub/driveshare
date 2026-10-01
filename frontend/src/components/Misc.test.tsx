import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderAt } from '../test-utils';
import { VehicleCard } from './VehicleCard';
import { ShareButton } from './ShareButton';
import { OfflineBanner } from './OfflineBanner';
import { NearMe } from './NearMe';
import { useSavedStore } from '../store/savedStore';

const listing: any = { id: 'a1', basePriceCents: 8000, currency: 'USD', description: 'd', locationLabel: 'SF', distanceKm: 1.2, instantBookEnabled: true, minimumTrustTier: 'trusted', ownerAvgRating: 4.6,
  deliveryOptions: { delivery: true, radius_km: 10, fee: 15 }, vehicle: { year: 2022, make: 'Honda', model: 'Accord', photos: [] } };
beforeEach(() => useSavedStore.setState({ cars: {} }));

describe('VehicleCard save heart', () => {
  it('toggles saved state with accessible labels and stores a snapshot', () => {
    renderAt(<VehicleCard listing={listing} />, '/');
    const heart = screen.getByRole('button', { name: 'Save 2022 Honda Accord' });
    fireEvent.click(heart);
    expect(screen.getByRole('button', { name: 'Remove 2022 Honda Accord' })).toHaveAttribute('aria-pressed', 'true');
    expect(useSavedStore.getState().cars.a1).toMatchObject({ title: '2022 Honda Accord', price: '80.00 USD/day' });
    fireEvent.click(screen.getByRole('button', { name: /Remove/ })); expect(useSavedStore.getState().cars.a1).toBeUndefined();
  });
  it('shows delivery with its fee and free delivery as free', () => {
    const { unmount } = renderAt(<VehicleCard listing={listing} />, '/'); expect(screen.getByText('Delivery +15')).toBeInTheDocument(); unmount();
    renderAt(<VehicleCard listing={{ ...listing, deliveryOptions: { delivery: true, radius_km: 5, fee: 0 } }} />, '/'); expect(screen.getByText('Delivery free')).toBeInTheDocument();
  });
  it('the card is one link and the heart is not inside it', () => {
    renderAt(<VehicleCard listing={listing} />, '/');
    expect(screen.getAllByRole('link')).toHaveLength(1); expect(screen.getByRole('link').contains(screen.getByRole('button'))).toBe(false);
  });
});

describe('ShareButton', () => {
  it('copies the link when the share sheet is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share: undefined, clipboard: { writeText } });
    renderAt(<ShareButton title="x" />, '/'); fireEvent.click(screen.getByRole('button', { name: 'Share this car' }));
    expect(await screen.findByText('Link copied.')).toBeInTheDocument(); expect(writeText).toHaveBeenCalled();
  });
  it('tells the user what to do if copying fails, and stays quiet when they dismiss the share sheet', async () => {
    Object.assign(navigator, { share: undefined, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    const { unmount } = renderAt(<ShareButton title="x" />, '/'); fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByText(/Copy the link from your address bar/)).toBeInTheDocument(); unmount();
    const abort = Object.assign(new Error('x'), { name: 'AbortError' });
    Object.assign(navigator, { share: vi.fn().mockRejectedValue(abort) });
    renderAt(<ShareButton title="x" />, '/'); fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(navigator.share).toHaveBeenCalled()); expect(screen.queryByText(/Couldn't share/)).toBeNull();
  });
});

describe('OfflineBanner', () => {
  it('appears offline and clears when back online', () => {
    renderAt(<OfflineBanner />, '/');
    expect(screen.queryByRole('status')).toBeNull();
    window.dispatchEvent(new Event('offline')); return waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/offline/)).then(() => {
      window.dispatchEvent(new Event('online')); return waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    });
  });
});

describe('NearMe', () => {
  const setGeo = (impl: any) => Object.defineProperty(navigator, 'geolocation', { value: impl, configurable: true });
  it('sends coordinates, 50 km and nearest-first', () => {
    const onChange = vi.fn(); setGeo({ getCurrentPosition: (ok: any) => ok({ coords: { latitude: 1, longitude: 2 } }) });
    renderAt(<NearMe value={{}} onChange={onChange} />, '/'); fireEvent.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenCalledWith({ lat: 1, lng: 2, radiusKm: 50, sort: 'distance' });
  });
  it('permission denied: explains how to fix it', () => {
    setGeo({ getCurrentPosition: (_: any, bad: any) => bad({ code: 1 }) });
    renderAt(<NearMe value={{}} onChange={vi.fn()} />, '/'); fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('alert')).toHaveTextContent(/browser settings/);
  });
  it('unsupported browser and timeouts have their own messages', () => {
    setGeo(undefined); const a = renderAt(<NearMe value={{}} onChange={vi.fn()} />, '/'); fireEvent.click(screen.getByRole('button')); expect(screen.getByRole('alert')).toHaveTextContent(/can't share your location/); a.unmount();
    setGeo({ getCurrentPosition: (_: any, bad: any) => bad({ code: 3 }) });
    renderAt(<NearMe value={{}} onChange={vi.fn()} />, '/'); fireEvent.click(screen.getByRole('button')); expect(screen.getByRole('alert')).toHaveTextContent(/too long/);
  });
  it('when on: offers to show all cars again', () => {
    const onChange = vi.fn(); renderAt(<NearMe value={{ lat: 1, lng: 2, radiusKm: 50 }} onChange={onChange} />, '/');
    fireEvent.click(screen.getByRole('button', { name: 'Show all cars' })); expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ lat: undefined, lng: undefined }));
  });
});
