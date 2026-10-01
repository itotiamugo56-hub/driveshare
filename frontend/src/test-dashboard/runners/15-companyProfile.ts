import { TestContext } from '../ctx';
import { testRequest, assert, assertStatus, assertField, assertFieldNull, assertIsArray, setDomain } from '../helpers';

/**
 * Added per explicit product decision (verification-check follow-up, "company/
 * business profile" gap). Mirrors `smoke-test.ps1` Section 15 exactly, including
 * ordering and the specific cross-ownership 403 checks.
 */
export async function runCompanyProfile(ctx: TestContext) {
  setDomain('Company Profile');
  const owner = ctx.ownerToken;
  const renter = ctx.renterToken;

  const companyOwnerVehicle = await testRequest({
    method: 'POST',
    url: '/vehicles',
    data: { vin: `COMPANYVIN${Math.random().toString(36).slice(2, 10)}`, licensePlate: 'COMPANY1' },
    token: owner,
  });
  ctx.companyVehicleId = companyOwnerVehicle.body?.id;

  const createCompanyAsRenter = await testRequest({ method: 'POST', url: '/company-profiles', data: { name: "Renter's Fleet Co" }, token: renter });
  assertStatus(createCompanyAsRenter, [200, 201], 'Renter can create their own company profile (any authenticated user may)');
  ctx.renterCompanyId = createCompanyAsRenter.body?.id;

  const createCompany = await testRequest({
    method: 'POST',
    url: '/company-profiles',
    data: { name: "Owner's Fleet Co", description: 'Smoke-test fleet.' },
    token: owner,
  });
  assertStatus(createCompany, [200, 201], 'Owner creates a company profile');
  assertField(createCompany.body, 'name', "Owner's Fleet Co", 'Company profile name persisted');
  ctx.companyProfileId = createCompany.body?.id;

  const createCompanyDuplicate = await testRequest({ method: 'POST', url: '/company-profiles', data: { name: 'Second Co' }, token: owner });
  assert(createCompanyDuplicate.status === 409, 'An account CANNOT create a second company profile', `status=${createCompanyDuplicate.status}`);

  const getMyCompany = await testRequest({ method: 'GET', url: '/company-profiles/me', token: owner });
  assertField(getMyCompany.body, 'id', ctx.companyProfileId, "GET /company-profiles/me returns the caller's own profile");

  const assignAsRenter = await testRequest({
    method: 'POST',
    url: `/company-profiles/${ctx.companyProfileId}/vehicles`,
    data: { vehicleId: ctx.companyVehicleId },
    token: renter,
  });
  assert(assignAsRenter.status === 403, "Non-owner CANNOT assign a vehicle to someone else's company profile", `status=${assignAsRenter.status}`);

  const assignOthersVehicle = await testRequest({
    method: 'POST',
    url: `/company-profiles/${ctx.renterCompanyId}/vehicles`,
    data: { vehicleId: ctx.companyVehicleId },
    token: renter,
  });
  assert(
    assignOthersVehicle.status === 403,
    "Company profile owner CANNOT assign a vehicle they don't own, even to their own company profile",
    `status=${assignOthersVehicle.status}`,
  );

  const assignVehicle = await testRequest({
    method: 'POST',
    url: `/company-profiles/${ctx.companyProfileId}/vehicles`,
    data: { vehicleId: ctx.companyVehicleId },
    token: owner,
  });
  assertStatus(assignVehicle, [200, 201], "Owner assigns their own vehicle to their own company profile");
  assertField(assignVehicle.body, 'companyProfileId', ctx.companyProfileId, 'Vehicle now carries the company profile id');

  // Public: anonymous visitor browsing a company hub page. Uses `select`, not
  // `include`, on the backend (company-profile.service.ts) — verify no sensitive
  // vehicle field leaks through this public projection either.
  const getCompanyPublic = await testRequest({ method: 'GET', url: `/company-profiles/${ctx.companyProfileId}` });
  assertStatus(getCompanyPublic, [200], 'Anonymous caller (no token) can read a company profile');
  const companyVehicles: any[] = getCompanyPublic.body?.vehicles ?? [];
  assertIsArray(companyVehicles, 'Company profile lists its assigned vehicle', 1);
  assert(companyVehicles[0]?.vin === undefined, 'Company profile\'s public vehicle list does NOT expose vin', JSON.stringify(companyVehicles[0]));
  assert(companyVehicles[0]?.ownerId === undefined, 'Company profile\'s public vehicle list does NOT expose ownerId', JSON.stringify(companyVehicles[0]));

  const updateCompanyAsRenter = await testRequest({ method: 'PUT', url: `/company-profiles/${ctx.companyProfileId}`, data: { name: 'Hijacked' }, token: renter });
  assert(updateCompanyAsRenter.status === 403, "Non-owner CANNOT update someone else's company profile", `status=${updateCompanyAsRenter.status}`);

  const unassignAsRenter = await testRequest({ method: 'DELETE', url: `/company-profiles/${ctx.companyProfileId}/vehicles/${ctx.companyVehicleId}`, token: renter });
  assert(unassignAsRenter.status === 403, "Non-owner CANNOT unassign a vehicle from someone else's company profile", `status=${unassignAsRenter.status}`);

  const unassignVehicle = await testRequest({ method: 'DELETE', url: `/company-profiles/${ctx.companyProfileId}/vehicles/${ctx.companyVehicleId}`, token: owner });
  assertStatus(unassignVehicle, [200, 201], 'Owner unassigns their vehicle from their company profile');
  assertFieldNull(unassignVehicle.body, 'companyProfileId', 'Vehicle no longer carries a company profile id');
}
