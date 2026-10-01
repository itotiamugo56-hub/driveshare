import { TestContext } from '../ctx';
import { testRequest, assert, assertField, assertFieldNotNull, assertIsArray, setDomain } from '../helpers';

export async function runLogistics(ctx: TestContext) {
  setDomain('Logistics & Fleet');
  const owner = ctx.ownerToken;
  const renter = ctx.renterToken;

  const deliveryReq = await testRequest({
    method: 'POST',
    url: '/logistics/delivery-requests',
    data: { tripId: ctx.tripId, dropoffLocation: { lat: 37.77, lng: -122.41, address: '123 Smoke Test St' }, feeCents: 1500 },
    token: renter,
  });
  assertField(deliveryReq.body, 'status', 'requested', 'Request delivery');
  ctx.deliveryRequestId = deliveryReq.body.id;

  const getDelivery = await testRequest({ method: 'GET', url: `/logistics/delivery-requests/${ctx.deliveryRequestId}`, token: renter });
  assertField(getDelivery.body, 'feeCents', 1500, 'Get delivery request');

  const assignDelivery = await testRequest({ method: 'PUT', url: `/logistics/delivery-requests/${ctx.deliveryRequestId}/assign`, data: { assignedTo: 'owner' }, token: owner });
  assertField(assignDelivery.body, 'status', 'assigned', 'Assign delivery to owner');

  const redistribution = await testRequest({ method: 'POST', url: `/logistics/fleet/${ctx.ownerId}/redistribution-suggestions`, token: owner });
  assertIsArray(redistribution.body, 'Fleet redistribution suggestions (may legitimately be empty — heuristic threshold)');

  const bulkAsRenter = await testRequest({
    method: 'POST',
    url: `/logistics/fleet/${ctx.ownerId}/bulk-listings`,
    data: { listings: [{ vehicleId: ctx.vehicleId, basePriceCents: 6000 }] },
    token: renter,
  });
  assert(bulkAsRenter.status === 403, "Non-owner CANNOT bulk-create listings for someone else's vehicle", `status=${bulkAsRenter.status}`);

  const bulkListings = await testRequest({
    method: 'POST',
    url: `/logistics/fleet/${ctx.ownerId}/bulk-listings`,
    data: { listings: [{ vehicleId: ctx.vehicleId, basePriceCents: 6000 }] },
    token: owner,
  });
  assertIsArray(bulkListings.body, 'Bulk-create listings', 1);

  const calendarSync = await testRequest({ method: 'PUT', url: `/logistics/fleet/${ctx.ownerId}/calendar-sync`, token: owner });
  assertFieldNotNull(calendarSync.body, 'synced', 'Calendar sync');

  const today = new Date().toISOString().slice(0, 10);
  const twoDaysOut = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const maintenanceHold = await testRequest({
    method: 'POST',
    url: `/logistics/fleet/${ctx.ownerId}/maintenance-schedule`,
    data: { vehicleId: ctx.vehicleId, reason: 'scheduled_service', startDate: today, endDate: twoDaysOut },
    token: owner,
  });
  assertField(maintenanceHold.body, 'reason', 'scheduled_service', 'Create maintenance hold');
}
