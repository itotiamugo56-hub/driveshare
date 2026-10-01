import { TestContext } from '../ctx';
import { testRequest, assert, assertStatus, assertField, assertFieldNotNull, setDomain, newTestEmail, skip } from '../helpers';

export async function runAccessIot(ctx: TestContext) {
  setDomain('Access & IoT');
  const owner = ctx.ownerToken;
  const renter = ctx.renterToken;

  if (!ctx.adminAvailable) {
    skip('Access & IoT: device registration + immobilization', 'requires seeded admin token');
  } else {
    const regDevice = await testRequest({
      method: 'POST',
      url: '/access/devices',
      data: { vehicleId: ctx.vehicleId, deviceType: 'aftermarket_smart_lock', vendorRef: 'smoke-vendor' },
      token: ctx.adminToken,
    });
    assertStatus(regDevice, [200, 201], 'Register access device');
    ctx.deviceId = regDevice.body.id;

    const deviceHealth = await testRequest({ method: 'GET', url: `/access/devices/${ctx.deviceId}/health`, token: owner });
    assertFieldNotNull(deviceHealth.body, 'online', 'Device health check');
  }

  const validFrom = new Date().toISOString();
  const validUntil = new Date(Date.now() + 86400000).toISOString();

  if (!ctx.adminAvailable) {
    skip("Access & IoT: key issuance / commands / revoke", "requires a 'service' role token, minted via admin-created staff account");
    return;
  }

  // Mint a genuine service-role token via the admin/staff pipeline — the only
  // legitimate way to get one (see architecture doc §4, this is load-bearing).
  ctx.serviceEmail = newTestEmail('svc');
  const svcCreate = await testRequest({
    method: 'POST',
    url: '/admin/staff/accounts',
    data: { email: ctx.serviceEmail, password: ctx.password, role: 'service' },
    token: ctx.adminToken,
  });
  assertStatus(svcCreate, [200, 201], 'Admin creates a service-role account');
  const svcLogin = await testRequest({ method: 'POST', url: '/auth/login', data: { email: ctx.serviceEmail, password: ctx.password } });
  ctx.serviceToken = svcLogin.body.accessToken;
  assertFieldNotNull(svcLogin.body, 'accessToken', 'Login as service account');

  const keyAsOwner = await testRequest({
    method: 'POST',
    url: '/access/keys',
    data: { tripId: ctx.tripId, vehicleId: ctx.vehicleId, renterId: ctx.renterId, validFrom, validUntil },
    token: owner,
  });
  assert(keyAsOwner.status === 403, 'Ordinary user CANNOT issue a digital key directly (service only)', `status=${keyAsOwner.status}`);

  const issueKey = await testRequest({
    method: 'POST',
    url: '/access/keys',
    data: { tripId: ctx.tripId, vehicleId: ctx.vehicleId, renterId: ctx.renterId, validFrom, validUntil },
    token: ctx.serviceToken,
  });
  assertStatus(issueKey, [200, 201], 'Service issues digital key');
  assertField(issueKey.body, 'status', 'active', 'Digital key active on issuance');
  ctx.keyId = issueKey.body.id;

  const getKey = await testRequest({ method: 'GET', url: `/access/keys/${ctx.keyId}`, token: renter });
  assertField(getKey.body, 'renterId', ctx.renterId, 'Get digital key');

  const unlockAsOwner = await testRequest({ method: 'POST', url: `/access/keys/${ctx.keyId}/unlock`, token: owner });
  assert(unlockAsOwner.status === 403, "Non-renter (vehicle owner) CANNOT use the renter's digital key", `status=${unlockAsOwner.status}`);

  const unlock = await testRequest({ method: 'POST', url: `/access/keys/${ctx.keyId}/unlock`, token: renter });
  assertStatus(unlock, [200, 201], 'Renter unlocks vehicle');
  assertField(unlock.body, 'MOCKED', true, 'Unlock command is clearly marked mocked');

  const lock = await testRequest({ method: 'POST', url: `/access/keys/${ctx.keyId}/lock`, token: renter });
  assertStatus(lock, [200, 201], 'Renter locks vehicle');

  const startIgnition = await testRequest({ method: 'POST', url: `/access/keys/${ctx.keyId}/start-ignition`, token: renter });
  assertStatus(startIgnition, [200, 201], 'Renter starts ignition');

  const immobilizeAsRenter = await testRequest({
    method: 'POST',
    url: `/access/vehicles/${ctx.vehicleId}/immobilize`,
    data: { justification: 'trying to steal my own rental lol' },
    token: renter,
  });
  assert(immobilizeAsRenter.status === 403, 'Renter CANNOT immobilize a vehicle (admin/support only)', `status=${immobilizeAsRenter.status}`);

  const immobilizeShortReason = await testRequest({
    method: 'POST',
    url: `/access/vehicles/${ctx.vehicleId}/immobilize`,
    data: { justification: 'short' },
    token: ctx.adminToken,
  });
  assert(immobilizeShortReason.status === 400, 'Immobilization with insufficient justification is rejected', `status=${immobilizeShortReason.status}`);

  const immobilize = await testRequest({
    method: 'POST',
    url: `/access/vehicles/${ctx.vehicleId}/immobilize`,
    data: { justification: 'Confirmed theft report filed with police, immobilizing per safety policy.' },
    token: ctx.adminToken,
  });
  assertField(immobilize.body, 'immobilized', true, 'Admin immobilizes vehicle with valid justification');

  const geofence = await testRequest({
    method: 'POST',
    url: `/access/vehicles/${ctx.vehicleId}/geofence`,
    data: { tripId: ctx.tripId, polygon: { type: 'circle', radiusMeters: 5000 } },
    token: owner,
  });
  assertStatus(geofence, [200, 201], 'Set geofence');

  const location = await testRequest({ method: 'GET', url: `/access/vehicles/${ctx.vehicleId}/location`, token: owner });
  assertFieldNotNull(location.body, 'lat', 'Get vehicle location (mocked)');

  const webhookAsOwner = await testRequest({
    method: 'POST',
    url: '/access/webhooks/telematics-event',
    data: { vehicleId: ctx.vehicleId, eventType: 'tamper_detected', payload: {} },
    token: owner,
  });
  assert(webhookAsOwner.status === 403, 'Ordinary user CANNOT post telematics webhook events (service only)', `status=${webhookAsOwner.status}`);

  const webhookEvent = await testRequest({
    method: 'POST',
    url: '/access/webhooks/telematics-event',
    data: { vehicleId: ctx.vehicleId, eventType: 'tamper_detected', payload: { note: 'smoke-test' } },
    token: ctx.serviceToken,
  });
  assertStatus(webhookEvent, [200, 201], 'Service posts telematics tamper event');
  assertField(webhookEvent.body, 'eventType', 'tamper_detected', 'Telematics event recorded');

  const revokeKey = await testRequest({ method: 'POST', url: `/access/keys/${ctx.keyId}/revoke`, token: ctx.serviceToken });
  assertField(revokeKey.body, 'status', 'revoked', 'Service revokes digital key');
}
