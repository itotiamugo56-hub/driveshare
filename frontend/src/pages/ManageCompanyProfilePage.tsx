import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useMyCompanyProfile,
  useCreateCompanyProfile,
  useUpdateCompanyProfile,
  useAssignVehicleToCompany,
  useUnassignVehicleFromCompany,
} from '../hooks/useCompanyProfile';
import { StatusBanner } from '../components/StatusBanner';

/**
 * Added per explicit product decision (verification-check follow-up, "company/
 * business profile" gap). Vehicle assignment is by pasting a vehicle id
 * rather than a picker UI (no "list my vehicles" endpoint exists on the
 * backend to populate a dropdown from — see implementation summary's open
 * questions). This mirrors the rest of this MVP frontend's ID-based
 * interactions elsewhere (e.g. the Test Dashboard), not a new pattern.
 */
export function ManageCompanyProfilePage() {
  const myProfile = useMyCompanyProfile();
  const createMutation = useCreateCompanyProfile();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [vehicleIdInput, setVehicleIdInput] = useState('');

  if (myProfile.isLoading) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
        <StatusBanner kind="loading" message="Loading…" />
      </div>
    );
  }

  if (myProfile.isError) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
        <StatusBanner
          kind="error"
          message={`Could not check for an existing company profile: ${myProfile.error instanceof Error ? myProfile.error.message : 'sign-in required'}`}
        />
      </div>
    );
  }

  if (!myProfile.data) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: 24, textAlign: 'left' }}>
        <h1 style={{ fontSize: 22 }}>Create a company profile</h1>
        <p style={{ fontSize: 13, color: 'var(--text)' }}>
          One company profile per account (see implementation summary — multi-staff accounts are not supported).
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <input placeholder="Company name" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <button
            disabled={!name.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate({ name: name.trim(), description: description.trim() || undefined })}
          >
            Create
          </button>
          {createMutation.isError && (
            <StatusBanner
              kind="error"
              message={`Could not create company profile: ${createMutation.error instanceof Error ? createMutation.error.message : 'unknown error'}`}
            />
          )}
        </div>
      </div>
    );
  }

  return <ExistingCompanyProfileManager companyProfileId={myProfile.data.id} name={myProfile.data.name} description={myProfile.data.description} vehicleIdInput={vehicleIdInput} setVehicleIdInput={setVehicleIdInput} />;
}

function ExistingCompanyProfileManager({
  companyProfileId,
  name: initialName,
  description: initialDescription,
  vehicleIdInput,
  setVehicleIdInput,
}: {
  companyProfileId: string;
  name: string;
  description: string | null;
  vehicleIdInput: string;
  setVehicleIdInput: (v: string) => void;
}) {
  const updateMutation = useUpdateCompanyProfile(companyProfileId);
  const assignMutation = useAssignVehicleToCompany(companyProfileId);
  const unassignMutation = useUnassignVehicleFromCompany(companyProfileId);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? '');

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24, textAlign: 'left' }}>
      <h1 style={{ fontSize: 22 }}>Manage company profile</h1>
      <p style={{ fontSize: 13 }}>
        Public page:{' '}
        <Link to={`/companies/${companyProfileId}`} style={{ color: 'var(--accent)' }}>
          /companies/{companyProfileId}
        </Link>
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        <button
          disabled={updateMutation.isPending}
          onClick={() => updateMutation.mutate({ name: name.trim() || undefined, description: description.trim() || undefined })}
        >
          Save
        </button>
        {updateMutation.isError && (
          <StatusBanner
            kind="error"
            message={`Could not save: ${updateMutation.error instanceof Error ? updateMutation.error.message : 'unknown error'}`}
          />
        )}
      </div>

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Assign a vehicle</h2>
      <p style={{ fontSize: 12, color: 'var(--text)' }}>
        You must already own the vehicle. Paste its id below (vehicle registration has no dedicated
        product screen yet — see implementation summary's open questions).
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input placeholder="Vehicle id" value={vehicleIdInput} onChange={(e) => setVehicleIdInput(e.target.value)} />
        <button
          disabled={!vehicleIdInput.trim() || assignMutation.isPending}
          onClick={() => assignMutation.mutate(vehicleIdInput.trim())}
        >
          Assign
        </button>
        <button
          disabled={!vehicleIdInput.trim() || unassignMutation.isPending}
          onClick={() => unassignMutation.mutate(vehicleIdInput.trim())}
        >
          Unassign
        </button>
      </div>
      {assignMutation.isError && (
        <StatusBanner
          kind="error"
          message={`Could not assign: ${assignMutation.error instanceof Error ? assignMutation.error.message : 'unknown error'}`}
        />
      )}
      {unassignMutation.isError && (
        <StatusBanner
          kind="error"
          message={`Could not unassign: ${unassignMutation.error instanceof Error ? unassignMutation.error.message : 'unknown error'}`}
        />
      )}
    </div>
  );
}
