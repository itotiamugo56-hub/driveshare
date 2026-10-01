import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CompanyProfilePage } from './CompanyProfilePage';
import * as useCompanyProfileModule from '../hooks/useCompanyProfile';
import type { CompanyProfile } from '../api/schemas/companyProfile.schemas';

vi.mock('../hooks/useCompanyProfile');

function renderAt(companyProfileId: string) {
  return render(
    <MemoryRouter initialEntries={[`/companies/${companyProfileId}`]}>
      <Routes>
        <Route path="/companies/:companyProfileId" element={<CompanyProfilePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockCompany(overrides: Partial<ReturnType<typeof useCompanyProfileModule.useCompanyProfile>>) {
  vi.mocked(useCompanyProfileModule.useCompanyProfile).mockReturnValue({
    isLoading: false,
    isError: false,
    data: undefined,
    error: null,
    ...overrides,
  } as ReturnType<typeof useCompanyProfileModule.useCompanyProfile>);
}

const sampleCompany: CompanyProfile = {
  id: 'company-1',
  name: "Owner's Fleet Co",
  description: 'A trusted local rental fleet.',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  vehicles: [
    {
      id: 'vehicle-1',
      make: 'Toyota',
      model: 'Camry',
      year: 2023,
      trim: 'SE',
      seats: 5,
      transmission: 'automatic',
      fuelType: 'hybrid',
      mileageLimitPerDay: 150,
      features: [],
      photos: [],
      listings: [
        {
          id: 'listing-1',
          vehicleId: 'vehicle-1',
          ownerId: 'owner-1',
          basePriceCents: 6500,
          currency: 'USD',
          description: null,
          locationLat: null,
          locationLng: null,
          locationLabel: null,
          instantBookEnabled: false,
          deliveryOptions: { delivery: false, radius_km: 0, fee: 0 },
          minimumTrustTier: null,
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    },
  ],
};

describe('CompanyProfilePage', () => {
  it('shows a loading state', () => {
    mockCompany({ isLoading: true });
    renderAt('company-1');
    expect(screen.getByText('Loading company profile…')).toBeInTheDocument();
  });

  it('shows an error state when the company profile is not found', () => {
    mockCompany({ isError: true, error: new Error('Not Found') });
    renderAt('company-1');
    expect(screen.getByRole('alert')).toHaveTextContent('Not Found');
  });

  it('renders the company name, description, and its vehicles with active listing price', () => {
    mockCompany({ data: sampleCompany });
    renderAt('company-1');

    expect(screen.getByText("Owner's Fleet Co")).toBeInTheDocument();
    expect(screen.getByText('A trusted local rental fleet.')).toBeInTheDocument();
    expect(screen.getByText('2023 Toyota Camry')).toBeInTheDocument();
    expect(screen.getByText('65.00 USD/day')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View listing/ })).toHaveAttribute('href', '/listings/listing-1');
  });

  it('shows "No active listing" for a vehicle with no active listings', () => {
    mockCompany({ data: { ...sampleCompany, vehicles: [{ ...sampleCompany.vehicles[0], listings: [] }] } });
    renderAt('company-1');
    expect(screen.getByText('No active listing')).toBeInTheDocument();
  });

  it('shows an empty state when the company has no vehicles', () => {
    mockCompany({ data: { ...sampleCompany, vehicles: [] } });
    renderAt('company-1');
    expect(screen.getByText('This company has no vehicles listed yet.')).toBeInTheDocument();
  });
});
