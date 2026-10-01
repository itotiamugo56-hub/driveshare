import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderAt } from '../test-utils';
import { CheckoutPage } from './CheckoutPage';
import { useAuthStore } from '../store/authStore';
import { tripsApi } from '../api/domains/trips.api';

vi.mock('../api/domains/trips.api', () => ({ tripsApi: { preview: vi.fn(), book: vi.fn() } }));
vi.mock('../hooks/useVehicleListing', () => ({
  useListingDetail: () => ({ isLoading: false, isError: false, data: { id: 'L', vehicleId: 'V', ownerId: 'O', currency: 'USD', basePriceCents: 8000, locationLabel: 'Austin', deliveryOptions: { delivery: true, fee: 15 } } }),
  useVehiclePublicSummary: () => ({ data: { year: 2022, make: 'Honda', model: 'Accord' } }),
}));
vi.mock('../components/RenterHelp', () => ({
  EligibilityCard: () => <div>eligibility</div>,
  CoverPicker: ({ onPick }: any) => <button onClick={() => onPick({ id: 'T', name: 'standard', deductibleCents: 75000 })}>pick standard</button>,
}));
vi.mock('../components/PaymentMethods', () => ({ PaymentMethods: ({ onSelect }: any) => <button onClick={() => onSelect('M')}>pick card</button> }));
vi.mock('../components/ListingTrust', () => ({ DepositNote: () => null }));

const preview = tripsApi.preview as unknown as ReturnType<typeof vi.fn>;
const book = tripsApi.book as unknown as ReturnType<typeof vi.fn>;
const P = { days: 3, currency: 'USD', rentalCents: 24000, dailyCoverCents: 2800, coverCents: 8400, deliveryCents: 0, totalCents: 32400, depositCents: 75000, instantBook: true, freeCancellationUntil: '2030-01-01T10:00:00Z', eligibility: { eligible: true, reason: null } };
const URL = '/listings/L/checkout?start=2030-01-03&end=2030-01-06';
const go = () => renderAt(<CheckoutPage />, URL, '/listings/:listingId/checkout');
const boxes = () => screen.getAllByRole('checkbox').filter((b) => !b.closest('label')?.textContent?.includes('Deliver'));

beforeEach(() => { vi.clearAllMocks(); useAuthStore.setState({ userId: 'u1', accessToken: 'tok' }); preview.mockResolvedValue(P); });

describe('CheckoutPage', () => {
  it('signed out: sends the renter to sign in and back, keeping the dates', () => {
    useAuthStore.setState({ userId: null, accessToken: null });
    go(); expect(screen.getByText(/elsewhere/)).toBeInTheDocument();
    expect(preview).not.toHaveBeenCalled();
  });
  it('missing dates: asks for them instead of showing a broken price', () => {
    renderAt(<CheckoutPage />, '/listings/L/checkout', '/listings/:listingId/checkout');
    expect(screen.getByText('Pick your dates first.')).toBeInTheDocument();
  });
  it('shows server-calculated totals once cover is chosen', async () => {
    go(); fireEvent.click(screen.getByText('pick standard'));
    expect(await screen.findByText('$324.00')).toBeInTheDocument();
    expect(screen.getByText('$84.00')).toBeInTheDocument();
    expect(screen.getByText('$750.00')).toBeInTheDocument();
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({ listingId: 'L', startDate: '2030-01-03', endDate: '2030-01-06', coverageTierId: 'T' }), 'tok');
  });
  it('the book button stays off until cover, card and all three confirmations are done, and says what is missing', async () => {
    go(); const btn = screen.getByRole('button', { name: /Confirm and book/ });
    expect(btn).toBeDisabled(); expect(screen.getByText('Choose your cover.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('pick standard')); await screen.findByText('$324.00');
    expect(screen.getByText(/how you'll pay/i, { selector: 'small' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('pick card'));
    expect(screen.getByText('Tick the three confirmations.')).toBeInTheDocument();
    boxes().forEach((b) => fireEvent.click(b)); expect(btn).toBeEnabled();
    fireEvent.click(boxes()[1]); expect(btn).toBeDisabled();
  });
  it('confirmations state the real deductible and deposit', async () => {
    go(); fireEvent.click(screen.getByText('pick standard'));
    expect(await screen.findByText(/pay the first \$750\.00/)).toBeInTheDocument();
    expect(screen.getByText(/\$750\.00 is held on my card/)).toBeInTheDocument();
  });
  it('books with the right payload and moves to the trip page', async () => {
    book.mockResolvedValue({ id: 'T9' }); go();
    fireEvent.click(screen.getByText('pick standard')); await screen.findByText('$324.00'); fireEvent.click(screen.getByText('pick card'));
    boxes().forEach((b) => fireEvent.click(b)); fireEvent.click(screen.getByRole('button', { name: /Confirm and book/ }));
    await waitFor(() => expect(book).toHaveBeenCalledWith(expect.objectContaining({ listingId: 'L', coverageTierId: 'T', paymentMethodId: 'M', comprehensionAnswers: expect.arrayContaining([expect.objectContaining({ questionId: 'deductible' })]) }), 'tok'));
    expect(book.mock.calls[0][0].comprehensionAnswers).toHaveLength(3);
    await screen.findByText(/elsewhere/);
  });
  it('taken days: shows the server sentence and a way to change dates; nothing is navigated', async () => {
    book.mockRejectedValue({ statusCode: 409, message: 'Someone else just booked those days. Pick different dates.' }); go();
    fireEvent.click(screen.getByText('pick standard')); await screen.findByText('$324.00'); fireEvent.click(screen.getByText('pick card'));
    boxes().forEach((b) => fireEvent.click(b)); fireEvent.click(screen.getByRole('button', { name: /Confirm and book/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Someone else just booked those days');
    expect(screen.getByRole('link', { name: 'Change dates' })).toBeInTheDocument();
    expect(screen.queryByText(/elsewhere/)).toBeNull();
  });
  it('server error while booking: reassuring generic message, button usable again', async () => {
    book.mockRejectedValue({ statusCode: 500, message: 'x' }); go();
    fireEvent.click(screen.getByText('pick standard')); await screen.findByText('$324.00'); fireEvent.click(screen.getByText('pick card'));
    boxes().forEach((b) => fireEvent.click(b)); fireEvent.click(screen.getByRole('button', { name: /Confirm and book/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Nothing you did caused it/);
    expect(screen.getByRole('button', { name: /Confirm and book/ })).toBeEnabled();
  });
  it('price preview failure (taken days) explains and links back', async () => {
    preview.mockRejectedValue({ statusCode: 409, message: 'Some of those days are already taken. Pick different dates.' }); go();
    fireEvent.click(screen.getByText('pick standard'));
    expect(await screen.findByRole('alert')).toHaveTextContent('already taken');
  });
  it('an ineligible renter cannot book and is told why', async () => {
    preview.mockResolvedValue({ ...P, eligibility: { eligible: false, reason: 'x' } }); go();
    fireEvent.click(screen.getByText('pick standard')); await screen.findByText('$324.00'); fireEvent.click(screen.getByText('pick card'));
    boxes().forEach((b) => fireEvent.click(b));
    expect(screen.getByRole('button', { name: /Confirm and book/ })).toBeDisabled();
    expect(screen.getByText('This car needs a higher trust level.')).toBeInTheDocument();
  });
  it('a request-only car says the host must accept first', async () => {
    preview.mockResolvedValue({ ...P, instantBook: false }); go(); fireEvent.click(screen.getByText('pick standard'));
    expect(await screen.findByRole('button', { name: 'Send request to host' })).toBeInTheDocument();
    expect(screen.getByText(/host has to accept before you are charged/)).toBeInTheDocument();
  });
});
