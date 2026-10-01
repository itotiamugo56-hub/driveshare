import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderAt } from '../test-utils';
import { PaymentMethods } from './PaymentMethods';
import { HostTrust, ConditionCard } from './ListingTrust';
import { useAuthStore } from '../store/authStore';
import { paymentsApi } from '../api/domains/payments.api';
import { vehicleListingApi } from '../api/domains/vehicleListing.api';

vi.mock('../api/domains/payments.api', () => ({ paymentsApi: { listPaymentMethods: vi.fn(), addPaymentMethod: vi.fn(), removePaymentMethod: vi.fn() } }));
vi.mock('../api/domains/vehicleListing.api', () => ({ vehicleListingApi: { getLatestConditionBaseline: vi.fn() } }));
vi.mock('../hooks/useUserProfile', () => ({ useUserReviewHistory: vi.fn(), useUserBadges: vi.fn() }));
import { useUserReviewHistory, useUserBadges } from '../hooks/useUserProfile';
const pay = paymentsApi as unknown as Record<string, ReturnType<typeof vi.fn>>;
const base = vehicleListingApi.getLatestConditionBaseline as unknown as ReturnType<typeof vi.fn>;
const rev = useUserReviewHistory as unknown as ReturnType<typeof vi.fn>;
const bad = useUserBadges as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => { vi.clearAllMocks(); useAuthStore.setState({ userId: 'u1', accessToken: 'tok' }); });

describe('PaymentMethods', () => {
  const open = async (methods: unknown[] = []) => {
    pay.listPaymentMethods.mockResolvedValue(methods); const onSelect = vi.fn();
    renderAt(<PaymentMethods selected={null} onSelect={onSelect} />, '/x'); return onSelect;
  };
  const fill = (n: string, e: string, c: string) => {
    fireEvent.change(screen.getByLabelText('Card number'), { target: { value: n } });
    fireEvent.change(screen.getByLabelText('Expiry'), { target: { value: e } });
    fireEvent.change(screen.getByLabelText('Security code'), { target: { value: c } });
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));
  };
  it('no cards: explains and offers add', async () => {
    await open(); expect(await screen.findByText(/no saved card yet/)).toBeInTheDocument(); expect(screen.getByRole('button', { name: '+ Add a card' })).toBeInTheDocument();
  });
  it('lists cards and selecting one reports its id', async () => {
    const onSelect = await open([{ id: 'm1', type: 'card', brand: 'Visa', last4: '4242' }]);
    fireEvent.click(await screen.findByRole('radio', { name: /Visa ending 4242/ })); expect(onSelect).toHaveBeenCalledWith('m1');
  });
  it('validates number, expiry and code with specific messages, without calling the API', async () => {
    await open(); fireEvent.click(await screen.findByRole('button', { name: '+ Add a card' }));
    fill('12ab', '08/28', '123'); expect(screen.getByRole('alert')).toHaveTextContent(/13 to 19 digits/);
    fill('4242424242424242', '13/28', '123'); expect(screen.getByRole('alert')).toHaveTextContent(/MM\/YY/);
    fill('4242424242424242', '08/28', '12'); expect(screen.getByRole('alert')).toHaveTextContent(/3 or 4 digits/);
    expect(pay.addPaymentMethod).not.toHaveBeenCalled();
  });
  it('accepts spaces in the number and saves, then selects the new card', async () => {
    pay.addPaymentMethod.mockResolvedValue({ id: 'new' }); const onSelect = await open(); fireEvent.click(await screen.findByRole('button', { name: '+ Add a card' }));
    fill('4242 4242 4242 4242', '08/28', '123');
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('new'));
    expect(pay.addPaymentMethod).toHaveBeenCalledWith('card', { number: '4242424242424242', expMonth: '08', expYear: '28', cvc: '123' }, 'tok');
  });
  it('a rejected card explains and keeps the form open', async () => {
    pay.addPaymentMethod.mockRejectedValue({ statusCode: 400, message: 'declined' }); await open(); fireEvent.click(await screen.findByRole('button', { name: '+ Add a card' }));
    fill('4242424242424242', '08/28', '123'); expect(await screen.findByRole('alert')).toHaveTextContent(/Check the details/); expect(screen.getByLabelText('Card number')).toBeInTheDocument();
  });
  it('remove calls the API; a failed remove says the card was not removed', async () => {
    pay.removePaymentMethod.mockRejectedValue({ statusCode: 500, message: 'x' }); await open([{ id: 'm1', type: 'card', brand: 'Visa', last4: '4242' }]);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove card ending 4242' }));
    expect(await screen.findByText(/It was not removed/)).toBeInTheDocument(); expect(pay.removePaymentMethod).toHaveBeenCalledWith('m1', 'tok');
  });
  it('load failure has a retry', async () => {
    pay.listPaymentMethods.mockRejectedValueOnce({ statusCode: 0, message: 'Network Error' }).mockResolvedValueOnce([]);
    renderAt(<PaymentMethods selected={null} onSelect={vi.fn()} />, '/x'); expect(await screen.findByText(/internet connection/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' })); expect(await screen.findByText(/no saved card yet/)).toBeInTheDocument();
  });
});

describe('HostTrust', () => {
  const q = (data: unknown, extra = {}) => ({ isLoading: false, isError: false, data, ...extra });
  it('new host: says so and shows no fake rating', () => {
    rev.mockReturnValue(q({ averageRating: null, reviewCount: 0, reviews: [] })); bad.mockReturnValue(q([]));
    renderAt(<HostTrust ownerId="o" />, '/x'); expect(screen.getByText('No rating yet')).toBeInTheDocument(); expect(screen.getByText(/New host/)).toBeInTheDocument();
  });
  it('shows rating, Super Host, only visible reviews (max three), and the blind-review explainer', () => {
    const r = (i: number, v = 'visible') => ({ id: String(i), rating: 5, comment: `c${i}`, visibility: v });
    rev.mockReturnValue(q({ averageRating: 4.86, reviewCount: 9, reviews: [r(1), r(2, 'hidden'), r(3), r(4), r(5)] }));
    bad.mockReturnValue(q([{ badgeType: 'super_host', earnedAt: '2026-01-01' }]));
    renderAt(<HostTrust ownerId="o" />, '/x');
    expect(screen.getByText('★ 4.9')).toBeInTheDocument(); expect(screen.getByText('Super Host')).toBeInTheDocument(); expect(screen.getByText('9 reviews')).toBeInTheDocument();
    expect(screen.getAllByText(/^★+ c\d$/)).toHaveLength(3); expect(screen.queryByText(/c2/)).toBeNull(); expect(screen.getByText(/Why can I trust these reviews/)).toBeInTheDocument();
  });
  it('an unearned badge is not shown; load failure is friendly', () => {
    rev.mockReturnValue(q({ averageRating: 5, reviewCount: 1, reviews: [] })); bad.mockReturnValue(q([{ badgeType: 'super_host', earnedAt: null }]));
    const a = renderAt(<HostTrust ownerId="o" />, '/x'); expect(screen.queryByText('Super Host')).toBeNull(); a.unmount();
    rev.mockReturnValue(q(undefined, { isError: true, error: { statusCode: 500 } }));
    renderAt(<HostTrust ownerId="o" />, '/x'); expect(screen.getByText(/our side/)).toBeInTheDocument();
  });
});

describe('ConditionCard', () => {
  it('signed out: explains what signing in unlocks and does not call the API', () => {
    useAuthStore.setState({ userId: null, accessToken: null }); renderAt(<ConditionCard vehicleId="v" />, '/x');
    expect(screen.getByText(/Sign in to see the condition report/)).toBeInTheDocument(); expect(base).not.toHaveBeenCalled();
  });
  it('shows mileage, charge (fraction or percent) and marks', async () => {
    base.mockResolvedValue({ capturedAt: '2026-09-27T00:00:00Z', odometerReading: 18204, fuelOrChargeLevel: 0.92, aiDamageAnnotations: [{}, {}] });
    const a = renderAt(<ConditionCard vehicleId="v" />, '/x');
    expect(await screen.findByText('18,204')).toBeInTheDocument(); expect(screen.getByText('92%')).toBeInTheDocument(); expect(screen.getByText('2 noted')).toBeInTheDocument(); a.unmount();
    base.mockResolvedValue({ capturedAt: '2026-09-27T00:00:00Z', fuelOrChargeLevel: 75, aiDamageAnnotations: [] });
    renderAt(<ConditionCard vehicleId="v2" />, '/x'); expect(await screen.findByText('75%')).toBeInTheDocument(); expect(screen.getByText('None found')).toBeInTheDocument();
  });
  it('no report yet: tells the renter to ask the host', async () => {
    base.mockResolvedValue(null); renderAt(<ConditionCard vehicleId="v" />, '/x'); expect(await screen.findByText(/hasn't added a condition report/)).toBeInTheDocument();
  });
  it('failure: friendly', async () => {
    base.mockRejectedValue({ statusCode: 0, message: 'Network Error' }); renderAt(<ConditionCard vehicleId="v" />, '/x'); expect(await screen.findByText(/internet connection/)).toBeInTheDocument();
  });
});
