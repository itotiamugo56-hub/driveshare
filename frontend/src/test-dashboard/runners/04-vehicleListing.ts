import { TestContext } from '../ctx';
import { testRequest, assert, assertStatus, assertField, assertFieldNotNull, assertIsArray, setDomain, toBase64 } from '../helpers';
import { runTrustThresholdsAgainstListing } from './03-trust';

export async function runVehicleListing(ctx: TestContext) {
  setDomain('Vehicle & Listing');
  const owner = ctx.ownerToken;
  const renter = ctx.renterToken;

  const vinDecode = await testRequest({ method: 'POST', url: '/vehicles/vin-decode', data: { vin: '1HGCM82633A004352' }, token: owner });
  assertField(vinDecode.body, 'MOCKED', true, 'VIN decode is clearly marked mocked');
  assertFieldNotNull(vinDecode.body, 'make', 'VIN decode returns make');

  const vin = `TESTVIN${Math.random().toString(36).slice(2, 12)}`;
  const regVehicle = await testRequest({ method: 'POST', url: '/vehicles', data: { vin, licensePlate: 'SMOKE1' }, token: owner });
  assertStatus(regVehicle, [200, 201], 'Register vehicle');
  assertField(regVehicle.body, 'status', 'inactive', 'New vehicle starts inactive');
  ctx.vehicleId = regVehicle.body.id;

  const getVehicle = await testRequest({ method: 'GET', url: `/vehicles/${ctx.vehicleId}`, token: owner });
  assertField(getVehicle.body, 'vin', vin, 'Get vehicle');

  const updateVehicleAsRenter = await testRequest({ method: 'PUT', url: `/vehicles/${ctx.vehicleId}`, data: { trim: 'Hijacked' }, token: renter });
  assert(updateVehicleAsRenter.status === 403, "Non-owner CANNOT update someone else's vehicle", `status=${updateVehicleAsRenter.status}`);

  const updateVehicle = await testRequest({ method: 'PUT', url: `/vehicles/${ctx.vehicleId}`, data: { trim: 'LE' }, token: owner });
  assertField(updateVehicle.body, 'trim', 'LE', 'Owner updates own vehicle');

  const ownershipDoc = await testRequest({
    method: 'POST',
    url: `/vehicles/${ctx.vehicleId}/ownership-documents`,
    data: { documentBase64: toBase64('fake-registration-doc') },
    token: owner,
  });
  assertField(ownershipDoc.body, 'ownershipVerificationStatus', 'pending', 'Upload ownership document');

  // Audit finding: addVehiclePhoto/removeVehiclePhoto/reorderVehiclePhotos had no
  // frontend wrapper at all and were never exercised here. Covered now that
  // vehicleListingApi wraps all three (see src/api/domains/vehicleListing.api.ts).
  const addPhotoAsRenter = await testRequest({
    method: 'POST',
    url: `/vehicles/${ctx.vehicleId}/photos`,
    data: { photoBase64: toBase64('fake-jpeg-bytes-1'), mimeType: 'image/jpeg' },
    token: renter,
  });
  assert(addPhotoAsRenter.status === 403, "Non-owner CANNOT add a photo to someone else's vehicle", `status=${addPhotoAsRenter.status}`);

  const addPhoto1 = await testRequest({
    method: 'POST',
    url: `/vehicles/${ctx.vehicleId}/photos`,
    data: { photoBase64: toBase64('fake-jpeg-bytes-1'), mimeType: 'image/jpeg' },
    token: owner,
  });
  assertStatus(addPhoto1, [200, 201], 'Owner adds first vehicle photo');
  assertField(addPhoto1.body, 'position', 0, 'First photo gets position 0');

  const addPhoto2 = await testRequest({
    method: 'POST',
    url: `/vehicles/${ctx.vehicleId}/photos`,
    data: { photoBase64: toBase64('fake-jpeg-bytes-2'), mimeType: 'image/jpeg' },
    token: owner,
  });
  assertField(addPhoto2.body, 'position', 1, 'Second photo gets position 1');
  const photo1Id = addPhoto1.body.id;
  const photo2Id = addPhoto2.body.id;

  const reorderPhotos = await testRequest({
    method: 'PUT',
    url: `/vehicles/${ctx.vehicleId}/photos/order`,
    data: { photoIds: [photo2Id, photo1Id] },
    token: owner,
  });
  assertField(reorderPhotos.body, 'photos.0.id', photo2Id, 'Reordered photo list starts with photo2');
  assertField(reorderPhotos.body, 'photos.1.id', photo1Id, 'Reordered photo list ends with photo1');

  const removePhotoAsRenter = await testRequest({
    method: 'DELETE',
    url: `/vehicles/${ctx.vehicleId}/photos/${photo1Id}`,
    token: renter,
  });
  assert(removePhotoAsRenter.status === 403, "Non-owner CANNOT remove a photo from someone else's vehicle", `status=${removePhotoAsRenter.status}`);

  const removePhoto = await testRequest({ method: 'DELETE', url: `/vehicles/${ctx.vehicleId}/photos/${photo1Id}`, token: owner });
  assertField(removePhoto.body, 'deleted', true, 'Owner removes a vehicle photo');

  // New per explicit product decision (frontend architecture follow-up):
  // GET /vehicles/:vehicleId/public-summary is @Public() and must (a) work
  // with no token at all, (b) return only photo2 (photo1 was just removed),
  // and (c) NOT include any of the sensitive fields that only `getVehicle`
  // (still auth-gated, unchanged) exposes.
  const publicSummary = await testRequest({ method: 'GET', url: `/vehicles/${ctx.vehicleId}/public-summary` });
  assertStatus(publicSummary, [200], 'Anonymous caller (no token) can read vehicle public-summary');
  assertIsArray(publicSummary.body?.photos, 'Public summary photos', 1);
  assertField(publicSummary.body, 'photos.0.id', photo2Id, 'Public summary only shows the remaining photo');
  assert(publicSummary.body?.vin === undefined, 'Public summary does NOT expose vin', JSON.stringify(publicSummary.body));
  assert(publicSummary.body?.ownerId === undefined, 'Public summary does NOT expose ownerId', JSON.stringify(publicSummary.body));
  assert(
    publicSummary.body?.ownershipDocTokenRef === undefined,
    'Public summary does NOT expose ownershipDocTokenRef',
    JSON.stringify(publicSummary.body),
  );

  // No dedicated Trip Orchestration entity exists in this backend (architecture doc §1.14) —
  // tripId is generated here exactly the way a real orchestrator would, and threaded through
  // every later domain below just like smoke-test.ps1 does.
  ctx.tripId = crypto.randomUUID();

  const baseline = await testRequest({
    method: 'POST',
    url: `/vehicles/${ctx.vehicleId}/condition-baseline`,
    data: { type: 'listing_baseline', mediaAssetRefs: ['photo1.jpg', 'photo2.jpg'], odometerReading: 15000, fuelOrChargeLevel: 0.75 },
    token: owner,
  });
  assertStatus(baseline, [200, 201], 'Submit condition baseline');
  assertField(baseline.body, 'odometerReading', 15000, 'Condition baseline odometer');
  const baselineId = baseline.body.id;

  const latestBaseline = await testRequest({ method: 'GET', url: `/vehicles/${ctx.vehicleId}/condition-baseline/latest`, token: owner });
  assertField(latestBaseline.body, 'id', baselineId, 'Get latest condition baseline');

  const createListing = await testRequest({ method: 'POST', url: '/listings', data: { vehicleId: ctx.vehicleId, basePriceCents: 8000 }, token: owner });
  assertStatus(createListing, [200, 201], 'Create listing');
  assertField(createListing.body, 'status', 'draft', 'New listing starts as draft');
  ctx.listingId = createListing.body.id;

  const getListing = await testRequest({ method: 'GET', url: `/listings/${ctx.listingId}` }); // @Public — no token
  assertField(getListing.body, 'vehicleId', ctx.vehicleId, 'Get listing (public endpoint)');

  const updateListingAsRenter = await testRequest({ method: 'PUT', url: `/listings/${ctx.listingId}`, data: { status: 'active' }, token: renter });
  assert(updateListingAsRenter.status === 403, "Non-owner CANNOT activate someone else's listing", `status=${updateListingAsRenter.status}`);

  // Host vetting gate: a pending ownership document blocks publishing until staff approve it.
  const blockedActivate = await testRequest({ method: 'PUT', url: `/listings/${ctx.listingId}`, data: { status: 'active' }, token: owner });
  assert(blockedActivate.status === 403 && JSON.stringify(blockedActivate.body).includes('HOST_VETTING_REQUIRED'), 'Publishing is blocked while ownership is unverified', `status=${blockedActivate.status}`);
  const reviewAsOwner = await testRequest({ method: 'PUT', url: `/admin/vehicles/${ctx.vehicleId}/ownership-review`, data: { decision: 'verified' }, token: owner });
  assert(reviewAsOwner.status === 403, 'Owner CANNOT approve their own ownership document', `status=${reviewAsOwner.status}`);
  const reviewAsAdmin = await testRequest({ method: 'PUT', url: `/admin/vehicles/${ctx.vehicleId}/ownership-review`, data: { decision: 'verified' }, token: ctx.adminToken });
  assertField(reviewAsAdmin.body, 'ownershipVerificationStatus', 'verified', 'Staff approve the ownership document');
  const hostStatus = await testRequest({ method: 'GET', url: '/hosting/status', token: owner });
  assertField(hostStatus.body, 'ownsVehicles', true, 'Hosting status reports the owner owns vehicles');

  const activateListing = await testRequest({
    method: 'PUT',
    url: `/listings/${ctx.listingId}`,
    data: { status: 'active', instantBookEnabled: true },
    token: owner,
  });
  assertField(activateListing.body, 'status', 'active', 'Owner activates own listing');

  // Audit finding: this assertion previously called `assertIsArray(searchListings.body, ...)`,
  // which assumed the endpoint returned a bare array. VehicleListingService.searchListings
  // returns `{ meta: { sort, sortLabel }, results: [...] }` (to carry a disclosed sort label
  // per architecture doc §4 High) — the old assertion would fail against the real backend
  // regardless of whether search itself worked. Fixed to check the actual response shape.
  const searchListings = await testRequest({ method: 'GET', url: '/listings/search', params: { minPrice: 0 }, token: owner });
  assertField(searchListings.body, 'meta.sort', 'recommended', 'Default search sort is "recommended"');
  assertIsArray(searchListings.body?.results, 'Search listings results', 1);

  // Coverage for the search params that previously had no frontend wrapper support at all
  // (deliveryOnly, startDate/endDate, lat/lng/radiusKm, sort) — see vehicleListing.api.ts.
  const searchByPrice = await testRequest({
    method: 'GET',
    url: '/listings/search',
    params: { minPrice: 0, sort: 'price' },
    token: owner,
  });
  assertField(searchByPrice.body, 'meta.sort', 'price', 'Search accepts sort=price');

  const searchByDelivery = await testRequest({
    method: 'GET',
    url: '/listings/search',
    params: { deliveryOnly: true },
    token: owner,
  });
  assertIsArray(searchByDelivery.body?.results, 'Search accepts deliveryOnly (correct DTO field name)', 0);

  const tomorrowIso = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const nextWeekIso = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const searchByDateRange = await testRequest({
    method: 'GET',
    url: '/listings/search',
    params: { startDate: tomorrowIso, endDate: nextWeekIso },
    token: owner,
  });
  assertIsArray(searchByDateRange.body?.results, 'Search accepts startDate/endDate', 0);

  const calendarEmpty = await testRequest({ method: 'GET', url: `/listings/${ctx.listingId}/calendar`, token: owner });
  assertIsArray(calendarEmpty.body, 'Empty calendar before any entries', 0);

  // New per explicit product decision (frontend architecture follow-up):
  // getCalendar was made @Public() — payload is only { date, status }, so
  // opening it directly (rather than via a narrower projection, unlike
  // getVehicle above) does not risk exposing anything sensitive.
  const calendarAnonymous = await testRequest({ method: 'GET', url: `/listings/${ctx.listingId}/calendar` });
  assertStatus(calendarAnonymous, [200], 'Anonymous caller (no token) can read listing calendar');

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const updateCalendar = await testRequest({
    method: 'PUT',
    url: `/listings/${ctx.listingId}/calendar`,
    data: { entries: [{ date: tomorrow, status: 'available' }] },
    token: owner,
  });
  assertIsArray(updateCalendar.body, 'Update calendar', 1);

  const pricingProxy = await testRequest({ method: 'POST', url: `/listings/${ctx.listingId}/pricing-suggestion`, token: owner });
  assertFieldNotNull(pricingProxy.body, 'note', 'Pricing-suggestion proxy stub (flagged non-functional — see architecture doc §1.3)');

  // Throwaway vehicle+listing dedicated to the DELETE test.
  const throwawayVehicle = await testRequest({
    method: 'POST',
    url: '/vehicles',
    data: { vin: `THROWAWAY${Math.random().toString(36).slice(2, 10)}`, licensePlate: 'DEL1' },
    token: owner,
  });
  const throwawayListing = await testRequest({
    method: 'POST',
    url: '/listings',
    data: { vehicleId: throwawayVehicle.body.id, basePriceCents: 5000 },
    token: owner,
  });
  const deleteAsRenter = await testRequest({ method: 'DELETE', url: `/listings/${throwawayListing.body.id}`, token: renter });
  assert(deleteAsRenter.status === 403, "Non-owner CANNOT delete someone else's listing", `status=${deleteAsRenter.status}`);
  const deleteListing = await testRequest({ method: 'DELETE', url: `/listings/${throwawayListing.body.id}`, token: owner });
  assertField(deleteListing.body, 'status', 'removed', 'Owner deletes (soft-removes) own listing');

  await runTrustThresholdsAgainstListing(ctx);
}
