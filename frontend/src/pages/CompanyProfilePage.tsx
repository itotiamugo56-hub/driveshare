import { Link, useParams } from 'react-router-dom';
import { useCompanyProfile } from '../hooks/useCompanyProfile';
import { CoverPhoto } from '../components/PhotoGallery';
import { StatusBanner } from '../components/StatusBanner';

/**
 * Added per explicit product decision (verification-check follow-up, "company/
 * business profile with vehicle listings" gap — previously confirmed
 * UNSUPPORTED: no model, endpoint, or UI existed). Public — matches the
 * backend's `@Public()` on `GET /company-profiles/:id`.
 */
export function CompanyProfilePage() {
  const { companyProfileId } = useParams<{ companyProfileId: string }>();
  const { data: company, isLoading, isError, error } = useCompanyProfile(companyProfileId);

  if (isLoading) {
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
        <StatusBanner kind="loading" message="Loading company profile…" />
      </div>
    );
  }
  if (isError || !company) {
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
        <StatusBanner
          kind="error"
          message={`Could not load this company profile: ${error instanceof Error ? error.message : 'not found'}`}
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24, textAlign: 'left' }}>
      <h1 style={{ fontSize: 26 }}>{company.name}</h1>
      {company.description && <p style={{ marginTop: 8, lineHeight: 1.5 }}>{company.description}</p>}

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Vehicles</h2>
      {company.vehicles.length === 0 && <StatusBanner kind="empty" message="This company has no vehicles listed yet." />}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 16,
          marginTop: 12,
        }}
      >
        {company.vehicles.map((vehicle) => {
          const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
          const activeListing = vehicle.listings[0];
          return (
            <div key={vehicle.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
              <CoverPhoto photo={vehicle.photos[0]} altText={title} />
              <div style={{ marginTop: 8 }}>
                <strong style={{ fontSize: 14 }}>{title}</strong>
                {activeListing ? (
                  <div>
                    <span style={{ fontSize: 13 }}>
                      {(activeListing.basePriceCents / 100).toFixed(2)} {activeListing.currency}/day
                    </span>
                    <div>
                      <Link to={`/listings/${activeListing.id}`} style={{ fontSize: 12, color: 'var(--accent)' }}>
                        View listing →
                      </Link>
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: 'var(--text)', margin: '4px 0 0' }}>No active listing</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
