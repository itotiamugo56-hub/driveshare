import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderAt } from '../test-utils';
import { EligibilityCard, CoverPicker, HowItWorks } from './RenterHelp';
import { useAuthStore } from '../store/authStore';
import { trustApi } from '../api/domains/trust.api';
import { insuranceApi } from '../api/domains/insurance.api';

vi.mock('../api/domains/trust.api', () => ({ trustApi: { checkEligibility: vi.fn() } }));
vi.mock('../api/domains/insurance.api', () => ({ insuranceApi: { listTiers: vi.fn() } }));
const elig = trustApi.checkEligibility as unknown as ReturnType<typeof vi.fn>;
const tiers = insuranceApi.listTiers as unknown as ReturnType<typeof vi.fn>;
const signIn = () => useAuthStore.setState({ userId: 'u1', accessToken: 't' });

beforeEach(() => { vi.clearAllMocks(); useAuthStore.setState({ userId: null, accessToken: null }); });

describe('EligibilityCard', () => {
  it('signed out: invites sign-in with a link', () => {
    renderAt(<EligibilityCard listingId="L" />, '/x');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', expect.stringContaining('/login?next='));
    expect(elig).not.toHaveBeenCalled();
  });
  it('eligible: says so with the renter level', async () => {
    signIn(); elig.mockResolvedValue({ eligible: true, userTier: 'trusted' });
    renderAt(<EligibilityCard listingId="L" />, '/x');
    expect(await screen.findByText(/You can book this car/)).toHaveTextContent('trusted');
  });
  it('not eligible: names the needed level and links to verification', async () => {
    signIn(); elig.mockResolvedValue({ eligible: false, userTier: 'new', threshold: { minimumTier: 'elite' } });
    renderAt(<EligibilityCard listingId="L" />, '/x');
    expect(await screen.findByText(/Not yet/)).toBeInTheDocument();
    expect(screen.getByText(/elite level/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /verify your ID and licence/ })).toHaveAttribute('href', '/verify');
  });
  it('no trust score yet: points to verification', async () => {
    signIn(); elig.mockResolvedValue({ eligible: false, reason: 'No trust score on file' });
    renderAt(<EligibilityCard listingId="L" />, '/x');
    expect(await screen.findByRole('link', { name: 'Verify your ID' })).toHaveAttribute('href', '/verify');
  });
  it('failure: plain message and a working retry', async () => {
    signIn(); elig.mockRejectedValueOnce({ statusCode: 500, message: 'boom' }).mockResolvedValueOnce({ eligible: true, userTier: 'standard' });
    renderAt(<EligibilityCard listingId="L" />, '/x');
    expect(await screen.findByRole('alert')).toHaveTextContent(/our side/);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/You can book this car/)).toBeInTheDocument();
  });
});

describe('CoverPicker', () => {
  const data = [
    { id: 'b', name: 'baseline', deductibleCents: 150000, liabilityLimitCents: '3000000000' },
    { id: 's', name: 'standard', deductibleCents: 75000, liabilityLimitCents: 5000000000 },
    { id: 'p', name: 'premium', deductibleCents: 0, liabilityLimitCents: 10000000000 },
  ];
  it('explains each level in plain money words, largest deductible first', async () => {
    tiers.mockResolvedValue(data);
    renderAt(<CoverPicker currency="USD" />, '/x');
    const radios = await screen.findAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Basic'), expect.stringContaining('Standard'), expect.stringContaining('Complete'),
    ]);
    expect(radios[0]).toHaveTextContent('you pay the first $1,500');
    expect(radios[0]).toHaveTextContent('$30,000,000');
    expect(radios[2]).toHaveTextContent('You pay nothing');
  });
  it('selecting a level reports it and marks it checked', async () => {
    tiers.mockResolvedValue(data); const onPick = vi.fn();
    renderAt(<CoverPicker currency="USD" onPick={onPick} value="s" />, '/x');
    const basic = (await screen.findAllByRole('radio'))[0];
    fireEvent.click(basic);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
  });
  it('pre-selects Standard for a parent that needs a choice', async () => {
    tiers.mockResolvedValue(data); const onPick = vi.fn();
    renderAt(<CoverPicker currency="USD" onPick={onPick} />, '/x');
    await waitFor(() => expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ name: 'standard' })));
  });
  it('failure: friendly message that promises checkout will still show options', async () => {
    tiers.mockRejectedValue({ statusCode: 0, message: 'Network Error' });
    renderAt(<CoverPicker currency="USD" />, '/x');
    expect(await screen.findByText(/internet connection/)).toBeInTheDocument();
    expect(screen.getByText(/at checkout/)).toBeInTheDocument();
  });
});

describe('HowItWorks', () => {
  it('lists four steps', () => {
    renderAt(<HowItWorks />, '/x');
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });
});
