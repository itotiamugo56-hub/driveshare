import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderAt } from '../test-utils';
import { ListCarPage } from './ListCarPage';
import { OwnerHomePage } from './OwnerHomePage';
import { useAuthStore } from '../store/authStore';
import { ownerApi } from '../api/domains/owner.api';
import { tripsApi } from '../api/domains/trips.api';

vi.mock('../api/domains/owner.api', () => ({ ownerApi: { myListings: vi.fn(), myVehicles: vi.fn(), decodeVin: vi.fn(), registerVehicle: vi.fn(), updateVehicle: vi.fn(), createListing: vi.fn(), updateListing: vi.fn(), marketPrices: vi.fn() } }));
vi.mock('../api/domains/trips.api', () => ({ tripsApi: { mine: vi.fn(), respond: vi.fn() } }));
const photoState: { photos: any[] } = { photos: [] };
const addPhoto = vi.fn(); const delPhoto = vi.fn(); const reorder = vi.fn();
vi.mock('../hooks/useVehicleListing', () => ({
  useVehicle: () => ({ isLoading: false, isError: false, data: { id: 'V', year: 2022, make: 'Toyota', model: 'Camry', features: [], status: 'inactive', photos: photoState.photos } }),
  useAddVehiclePhoto: () => ({ mutateAsync: addPhoto }), useRemoveVehiclePhoto: () => ({ mutate: delPhoto, isError: false }), useReorderVehiclePhotos: () => ({ mutate: reorder, isError: false }),
}));
const o = ownerApi as unknown as Record<string, ReturnType<typeof vi.fn>>;
const t = tripsApi as unknown as Record<string, ReturnType<typeof vi.fn>>;
const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, url: `data:image/png;base64,${i}`, position: i }));
const VIN = '1HGCM82633A004352';
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); photoState.photos = []; useAuthStore.setState({ userId: 'u1', accessToken: 'tok' }); o.marketPrices.mockResolvedValue([6000, 8000, 9000, 12000]); o.hostingStatus = vi.fn().mockResolvedValue({ ownsVehicles: true, identityVerified: true, licenceValid: true, cars: [], canPublish: true, nextStep: 'none' }); });
const wizard = (q: string) => renderAt(<ListCarPage />, `/owner/new${q}`, '/owner/new');

describe('List your car: step 1', () => {
  it('signed out goes to sign in', () => { useAuthStore.setState({ userId: null, accessToken: null }); wizard(''); expect(screen.getByText(/elsewhere/)).toBeInTheDocument(); });
  it('a later step without a car goes back to step one', () => { wizard('?step=price'); expect(screen.getByText(/Let's add your car/)).toBeInTheDocument(); });
  it('explains a bad VIN and a missing plate before calling the server', () => {
    wizard(''); fireEvent.change(screen.getByLabelText(/VIN/), { target: { value: 'SHORT' } }); fireEvent.click(screen.getByRole('button', { name: 'Find my car' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/17 letters and numbers/);
    fireEvent.change(screen.getByLabelText(/VIN/), { target: { value: 'IOQ00000000000000' } }); fireEvent.click(screen.getByRole('button', { name: 'Find my car' })); expect(screen.getByRole('alert')).toHaveTextContent(/no I, O or Q/);
    fireEvent.change(screen.getByLabelText(/VIN/), { target: { value: VIN.toLowerCase() } }); fireEvent.click(screen.getByRole('button', { name: 'Find my car' })); expect(screen.getByRole('alert')).toHaveTextContent(/plate/);
    expect(o.decodeVin).not.toHaveBeenCalled();
  });
  const fillAndFind = async () => { wizard(''); fireEvent.change(screen.getByLabelText(/VIN/), { target: { value: VIN.toLowerCase() } }); fireEvent.change(screen.getByLabelText('Licence plate'), { target: { value: 'ABC123' } }); fireEvent.click(screen.getByRole('button', { name: 'Find my car' })); };
  it('shows what it found and only registers after the owner confirms; VIN is sent uppercased', async () => {
    o.decodeVin.mockResolvedValue({ make: 'Toyota', model: 'Camry', year: 2022, trim: 'SE' }); o.registerVehicle.mockResolvedValue({ id: 'V' });
    await fillAndFind(); expect(await screen.findByText(/We found a 2022 Toyota Camry SE/)).toBeInTheDocument(); expect(o.registerVehicle).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, add it' }));
    await waitFor(() => expect(o.registerVehicle).toHaveBeenCalledWith(VIN, 'ABC123', 'tok')); expect(o.decodeVin).toHaveBeenCalledWith(VIN, 'tok');
    expect(await screen.findByText(/Add photos/)).toBeInTheDocument();
  });
  it('"No" lets them fix the VIN without registering anything', async () => {
    o.decodeVin.mockResolvedValue({ make: 'A', model: 'B', year: 2020 }); await fillAndFind(); fireEvent.click(await screen.findByRole('button', { name: 'No, change the VIN' }));
    expect(screen.getByRole('button', { name: 'Find my car' })).toBeInTheDocument(); expect(o.registerVehicle).not.toHaveBeenCalled();
  });
  it('a car that is already registered gets the server\'s plain sentence', async () => {
    o.decodeVin.mockResolvedValue({ make: 'A', model: 'B', year: 2020 }); o.registerVehicle.mockRejectedValue({ statusCode: 409, message: 'This car (VIN) is already registered. If it is yours, contact support.' });
    await fillAndFind(); fireEvent.click(await screen.findByRole('button', { name: 'Yes, add it' })); expect(await screen.findByRole('alert')).toHaveTextContent('already registered');
  });
  it('a lookup failure says what to do', async () => { o.decodeVin.mockRejectedValue({ statusCode: 0, message: 'Network Error' }); await fillAndFind(); expect(await screen.findByRole('alert')).toHaveTextContent(/internet connection.*Check it and try again/); });
});

describe('List your car: photos', () => {
  it('blocks Continue until three photos and says how many are missing', () => {
    photoState.photos = photos(1); wizard('?vehicleId=V&step=photos');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled(); expect(screen.getByText('Add 2 more photos to continue.')).toBeInTheDocument();
  });
  it('three photos unlock Continue; cover is labelled and others can be made cover or removed', () => {
    photoState.photos = photos(3); wizard('?vehicleId=V&step=photos');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled(); expect(screen.getByAltText('Photo 1 (cover)')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Make cover' })[1]); expect(reorder).toHaveBeenCalledWith(['p2', 'p0', 'p1']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo 2' })); expect(delPhoto).toHaveBeenCalledWith('p1');
  });
  it('uploads each chosen photo, skips non-images, and names any that failed while keeping the rest', async () => {
    addPhoto.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('x')); wizard('?vehicleId=V&step=photos');
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    const img = (n: string) => new File(['abc'], n, { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [img('a.jpg'), img('b.jpg'), new File(['x'], 'notes.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByText(/1 file\(s\) skipped/)).toBeInTheDocument(); expect(await screen.findByText(/1 photo\(s\) didn't upload: b\.jpg/)).toBeInTheDocument();
    expect(addPhoto).toHaveBeenCalledTimes(2);
  });
});

describe('List your car: details and price', () => {
  it('details need seats, gearbox and fuel, saves them, then moves on', async () => {
    o.updateVehicle.mockResolvedValue({}); wizard('?vehicleId=V&step=details');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })); expect(screen.getByRole('alert')).toHaveTextContent('seats, gearbox, fuel'); expect(o.updateVehicle).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Seats'), { target: { value: '5' } }); fireEvent.click(screen.getByRole('radio', { name: 'Automatic' })); fireEvent.click(screen.getByRole('radio', { name: 'Hybrid' })); fireEvent.click(screen.getByLabelText(/Bluetooth/));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(o.updateVehicle).toHaveBeenCalledWith('V', { seats: 5, transmission: 'automatic', fuelType: 'hybrid', features: ['Bluetooth'] }, 'tok'));
    expect(await screen.findByText(/Set your price and rules/)).toBeInTheDocument();
  });
  it('price step: explains errors, shows net earnings and market median, and advances only when valid', async () => {
    wizard('?vehicleId=V&step=price'); fireEvent.click(screen.getByRole('button', { name: 'Preview my listing' }));
    expect(screen.getAllByRole('alert').map((a) => a.textContent).join(' ')).toMatch(/daily price.*where the car is/);
    fireEvent.change(screen.getByLabelText(/Price per day/), { target: { value: '80' } });
    expect(await screen.findByText(/You'd earn about \$68\.00 a day/)).toBeInTheDocument(); expect(await screen.findByText(/around \$9,?0?00?\.00|around \$90\.00/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Where is the car?'), { target: { value: 'Austin, TX' } }); fireEvent.click(screen.getByRole('button', { name: 'Preview my listing' }));
    expect(await screen.findByText(/This is how renters will see it/)).toBeInTheDocument();
  });
  it('the instant-book and delivery explanations change with the choice', () => {
    wizard('?vehicleId=V&step=price'); expect(screen.getByText(/more bookings and less messaging/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Instant Book/)); expect(screen.getByText(/You approve each trip first/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Offer delivery/)); expect(screen.getByLabelText('Fee (USD)')).toBeInTheDocument();
  });
});

describe('List your car: preview and publish', () => {
  const ready = { seats: '5', transmission: 'automatic', fuelType: 'hybrid', price: '80', locationLabel: 'Austin, TX', description: '', features: [], instantBook: true, delivery: true, deliveryFee: '15', deliveryRadius: '10', minTier: 'standard' };
  const seed = () => { photoState.photos = photos(3); localStorage.setItem('ds-draft-V', JSON.stringify(ready)); };
  it('shows the renter-facing card and blocks publishing until the checklist is done, with Fix links', async () => {
    photoState.photos = photos(1); wizard('?vehicleId=V&step=preview');
    expect(screen.getByLabelText('Preview of your listing')).toHaveTextContent('2022 Toyota Camry'); expect(screen.getByRole('button', { name: 'Publish my car' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Fix' })).toHaveLength(4); expect(screen.getByText('Finish the items above to publish.')).toBeInTheDocument();
  });
  it('the preview card is not clickable away from the wizard', () => { seed(); wizard('?vehicleId=V&step=preview'); const link = screen.getByRole('link', { name: '2022 Toyota Camry' }); expect(fireEvent.click(link)).toBe(false); });
  it('publishes: creates with the right payload (fee in currency units, cents for price), activates, then offers next steps', async () => {
    seed(); o.createListing.mockResolvedValue({ id: 'L1' }); o.updateListing.mockResolvedValue({}); wizard('?vehicleId=V&step=preview');
    expect(screen.getByText(/You earn about \$68\.00 a day/)).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Publish my car' }));
    expect(await screen.findByText(/Your car is live/)).toBeInTheDocument();
    expect(o.createListing).toHaveBeenCalledWith(expect.objectContaining({ vehicleId: 'V', basePriceCents: 8000, locationLabel: 'Austin, TX', instantBookEnabled: true, minimumTrustTier: 'standard', deliveryOptions: { delivery: true, radius_km: 10, fee: 15 } }), 'tok');
    expect(o.updateListing).toHaveBeenCalledWith('L1', { status: 'active' }, 'tok'); expect(screen.getByRole('button', { name: 'See it as a renter' })).toBeInTheDocument();
  });
  it('if activation fails after the listing was created, the retry does not create a duplicate', async () => {
    seed(); o.createListing.mockResolvedValue({ id: 'L1' }); o.updateListing.mockRejectedValueOnce({ statusCode: 500, message: 'x' }).mockResolvedValue({}); wizard('?vehicleId=V&step=preview');
    fireEvent.click(screen.getByRole('button', { name: 'Publish my car' })); expect(await screen.findByRole('alert')).toHaveTextContent(/Your listing is saved\. Tap publish to try again/);
    fireEvent.click(screen.getByRole('button', { name: 'Publish my car' })); expect(await screen.findByText(/Your car is live/)).toBeInTheDocument();
    expect(o.createListing).toHaveBeenCalledTimes(1);
  });
  it('a failed create says nothing was published', async () => {
    seed(); o.createListing.mockRejectedValue({ statusCode: 403, message: 'Only the vehicle owner may create a listing for it' }); wizard('?vehicleId=V&step=preview');
    fireEvent.click(screen.getByRole('button', { name: 'Publish my car' })); expect(await screen.findByRole('alert')).toHaveTextContent(/Nothing was published/);
  });
  it('progress is remembered across a reload (draft is kept per car)', () => {
    localStorage.setItem('ds-draft-V', JSON.stringify({ price: '55', locationLabel: 'Dallas' })); wizard('?vehicleId=V&step=price');
    expect(screen.getByLabelText(/Price per day/)).toHaveValue('55'); expect(screen.getByLabelText('Where is the car?')).toHaveValue('Dallas');
  });
});

describe('Owner dashboard', () => {
  const D = (n: number) => new Date(Date.now() + n * 864e5).toISOString();
  const trip = (o2: object) => ({ id: 't', role: 'owner', status: 'requested', startDate: D(4), endDate: D(7), days: 3, currency: 'USD', rentalCents: 24000, renterTier: 'trusted', ...o2 });
  const listing = (o2: object = {}) => ({ id: 'L1', vehicleId: 'V', basePriceCents: 8000, currency: 'USD', status: 'active', minimumTrustTier: 'standard', vehicle: { id: 'V', year: 2022, make: 'Honda', model: 'Accord', photos: [{ id: 'p', url: 'x' }] }, ...o2 });
  const home = () => renderAt(<OwnerHomePage />, '/owner');
  it('new host: a warm welcome with one button and three reassurances', async () => {
    o.myListings.mockResolvedValue([]); o.myVehicles.mockResolvedValue([]); t.mine.mockResolvedValue([]); home();
    expect(await screen.findByText(/Earn from the car you're not using/)).toBeInTheDocument(); expect(screen.getByRole('link', { name: 'List my car' })).toHaveAttribute('href', '/owner/new'); expect(screen.getByText(/You stay in control/)).toBeInTheDocument();
  });
  it('a request shows earnings after fee, renter checks and level, and accept sends the answer', async () => {
    o.myListings.mockResolvedValue([listing()]); o.myVehicles.mockResolvedValue([]); t.mine.mockResolvedValue([trip({ id: 'r1' })]); t.respond.mockResolvedValue({}); home();
    expect(await screen.findByText('You earn $204.00')).toBeInTheDocument(); expect(screen.getByText('Trusted level')).toBeInTheDocument(); expect(screen.getByText('ID verified')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' })); await waitFor(() => expect(t.respond).toHaveBeenCalledWith('r1', true, 'tok'));
  });
  it('decline asks first, and does nothing if the host backs out', async () => {
    o.myListings.mockResolvedValue([listing()]); o.myVehicles.mockResolvedValue([]); t.mine.mockResolvedValue([trip({ id: 'r1' })]); t.respond.mockResolvedValue({}); home();
    const yes = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true); await screen.findByText(/Needs your answer/);
    fireEvent.click(screen.getByRole('button', { name: 'Decline' })); expect(t.respond).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Decline' })); await waitFor(() => expect(t.respond).toHaveBeenCalledWith('r1', false, 'tok')); yes.mockRestore();
  });
  it('a failed answer says nothing changed', async () => {
    o.myListings.mockResolvedValue([listing()]); o.myVehicles.mockResolvedValue([]); t.mine.mockResolvedValue([trip({ id: 'r1' })]); t.respond.mockRejectedValue({ statusCode: 409, message: 'Someone else just booked those days. Pick different dates.' }); home();
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' })); expect(await screen.findByRole('alert')).toHaveTextContent(/Someone else just booked.*Nothing changed/);
  });
  it('ignores renter-side trips, cancelled ones and past requests', async () => {
    o.myListings.mockResolvedValue([listing()]); o.myVehicles.mockResolvedValue([]);
    t.mine.mockResolvedValue([trip({ id: 'a', role: 'renter' }), trip({ id: 'b', status: 'cancelled' }), trip({ id: 'c', startDate: D(-3), endDate: D(-1) })]); home();
    await screen.findByText('Your cars'); expect(screen.queryByText(/Needs your answer/)).toBeNull();
  });
  it('lists cars with status, price and required renter level; pause and go-live toggle', async () => {
    o.myListings.mockResolvedValue([listing(), listing({ id: 'L2', vehicleId: 'V2', status: 'paused' })]); o.myVehicles.mockResolvedValue([]); t.mine.mockResolvedValue([]); o.updateListing.mockResolvedValue({}); home();
    expect(await screen.findByText('Live')).toBeInTheDocument(); expect(screen.getByText('Paused')).toBeInTheDocument(); expect(screen.getAllByText(/\$80\.00\/day · Standard\+ renters/)).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' })); await waitFor(() => expect(o.updateListing).toHaveBeenCalledWith('L1', { status: 'paused' }, 'tok'));
    fireEvent.click(screen.getByRole('button', { name: 'Go live' })); await waitFor(() => expect(o.updateListing).toHaveBeenCalledWith('L2', { status: 'active' }, 'tok'));
  });
  it('unfinished cars offer "Continue setup" at the right step; unpublished drafts offer publish', async () => {
    o.myListings.mockResolvedValue([listing({ id: 'L3', vehicleId: 'V3', status: 'draft' })]);
    o.myVehicles.mockResolvedValue([{ id: 'V9', year: 2020, make: 'Kia', model: 'Rio', photos: [] }, { id: 'V3', year: 2022, make: 'Honda', model: 'Accord', photos: [] }]); t.mine.mockResolvedValue([]); home();
    expect(await screen.findByRole('link', { name: 'Continue setup' })).toHaveAttribute('href', '/owner/new?vehicleId=V9&step=photos'); expect(screen.getByRole('link', { name: 'Finish and publish' })).toHaveAttribute('href', '/owner/new?vehicleId=V3&step=preview');
  });
  it('load failure: friendly message and retry', async () => {
    o.myListings.mockRejectedValueOnce({ statusCode: 0, message: 'Network Error' }).mockResolvedValue([]); o.myVehicles.mockResolvedValue([]); t.mine.mockResolvedValue([]); home();
    expect(await screen.findByText(/internet connection/)).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Try again' })); expect(await screen.findByText(/Earn from the car/)).toBeInTheDocument();
  });
  it('signed out goes to sign in', () => { useAuthStore.setState({ userId: null, accessToken: null }); home(); expect(screen.getByText(/elsewhere/)).toBeInTheDocument(); });
});

describe('Publishing needs vetting', () => {
  it('keeps the listing as a draft and points to verification until approved', async () => {
    o.hostingStatus = vi.fn().mockResolvedValue({ ownsVehicles: true, identityVerified: true, licenceValid: true, cars: [], canPublish: false, nextStep: 'ownership' });
    photoState.photos = photos(3);
    localStorage.setItem('ds-draft-V', JSON.stringify({ price: '80', locationLabel: 'Nairobi', lat: -1.2, lng: 36.8, description: 'Clean', delivery: false }));
    wizard('?vehicleId=V&step=preview');
    const btn = await screen.findByRole('button', { name: /Publish after verification/ });
    expect(btn).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Verify' })).toHaveAttribute('href', '/verify');
  });
});
