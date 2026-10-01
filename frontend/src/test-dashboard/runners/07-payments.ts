import { TestContext } from '../ctx';
import { testRequest, assert, assertStatus, assertField, assertFieldNotNull, assertIsArray, setDomain, newTestEmail, skip } from '../helpers';

export async function runPayments(ctx: TestContext) {
  setDomain('Payments & Escrow');
  const owner = ctx.ownerToken;
  const renter = ctx.renterToken;

  const addOwnerMethod = await testRequest({
    method: 'POST',
    url: '/payments/methods',
    data: { type: 'bank_account', rawDetails: { routing: '021000021', account: '1111222233334444' } },
    token: owner,
  });
  assertStatus(addOwnerMethod, [200, 201], 'Owner adds payout method');
  assertFieldNotNull(addOwnerMethod.body, 'processorToken', 'Payment method vaulted (mocked processor)');

  const addRenterMethod = await testRequest({
    method: 'POST',
    url: '/payments/methods',
    data: { type: 'card', rawDetails: { number: '4111111111111111', exp: '12/30' } },
    token: renter,
  });
  assertStatus(addRenterMethod, [200, 201], 'Renter adds card');
  ctx.renterPaymentMethodId = addRenterMethod.body.id;

  const listRenterMethods = await testRequest({ method: 'GET', url: `/payments/methods/${ctx.renterId}`, token: renter });
  assertIsArray(listRenterMethods.body, 'List renter payment methods', 1);

  const throwawayMethod = await testRequest({
    method: 'POST',
    url: '/payments/methods',
    data: { type: 'card', rawDetails: { number: '4000000000000002' } },
    token: renter,
  });
  const removeMethod = await testRequest({ method: 'DELETE', url: `/payments/methods/${throwawayMethod.body.id}`, token: renter });
  assertField(removeMethod.body, 'status', 'removed', 'Remove a payment method');

  if (!ctx.adminAvailable) {
    skip('Payments & Escrow: authorize/capture/void/deposit/payout (service-role gated)', 'requires seeded admin to mint a service token');
    return;
  }

  if (!ctx.serviceToken) {
    const svcEmail2 = newTestEmail('svc');
    await testRequest({ method: 'POST', url: '/admin/staff/accounts', data: { email: svcEmail2, password: ctx.password, role: 'service' }, token: ctx.adminToken });
    const login = await testRequest({ method: 'POST', url: '/auth/login', data: { email: svcEmail2, password: ctx.password } });
    ctx.serviceToken = login.body.accessToken;
  }
  const svc = ctx.serviceToken;

  const authorizeAsUser = await testRequest({
    method: 'POST',
    url: '/payments/authorizations',
    data: { tripId: ctx.tripId, payerUserId: ctx.renterId, paymentMethodId: ctx.renterPaymentMethodId, amountCents: 10000 },
    token: renter,
  });
  assert(authorizeAsUser.status === 403, 'Ordinary user CANNOT directly authorize a payment (service only, prevents self-service fund manipulation)', `status=${authorizeAsUser.status}`);

  const authorize = await testRequest({
    method: 'POST',
    url: '/payments/authorizations',
    data: { tripId: ctx.tripId, payerUserId: ctx.renterId, paymentMethodId: ctx.renterPaymentMethodId, amountCents: 10000 },
    token: svc,
  });
  assertStatus(authorize, [200, 201], 'Service authorizes rental payment');
  assertField(authorize.body, 'status', 'authorized', 'Payment authorization created');
  ctx.authId = authorize.body.id;

  const capture = await testRequest({ method: 'POST', url: `/payments/authorizations/${ctx.authId}/capture`, token: svc });
  assertField(capture.body, 'status', 'captured', 'Service captures authorized payment');

  const doubleCapture = await testRequest({ method: 'POST', url: `/payments/authorizations/${ctx.authId}/capture`, token: svc });
  assert(doubleCapture.status === 400, 'Capturing an already-captured authorization is rejected', `status=${doubleCapture.status}`);

  // Void needs a FRESH, still-'authorized' authorization.
  const voidTripId = crypto.randomUUID();
  const authForVoid = await testRequest({
    method: 'POST',
    url: '/payments/authorizations',
    data: { tripId: voidTripId, payerUserId: ctx.renterId, paymentMethodId: ctx.renterPaymentMethodId, amountCents: 4200 },
    token: svc,
  });
  assertField(authForVoid.body, 'status', 'authorized', 'Create a fresh authorization to be voided');
  const authForVoidId = authForVoid.body.id;

  const voidAsUser = await testRequest({ method: 'POST', url: `/payments/authorizations/${authForVoidId}/void`, token: renter });
  assert(voidAsUser.status === 403, 'Ordinary user CANNOT void a payment authorization directly (service only)', `status=${voidAsUser.status}`);

  const voidAuth = await testRequest({ method: 'POST', url: `/payments/authorizations/${authForVoidId}/void`, token: svc });
  assertField(voidAuth.body, 'status', 'voided', 'Service voids a pending authorization (e.g. booking cancelled pre-trip)');

  const captureAfterVoid = await testRequest({ method: 'POST', url: `/payments/authorizations/${authForVoidId}/capture`, token: svc });
  assert(captureAfterVoid.status === 400, 'Cannot capture an authorization that has already been voided', `status=${captureAfterVoid.status}`);

  const preauthDeposit = await testRequest({
    method: 'POST',
    url: '/payments/deposits/preauthorize',
    data: { tripId: ctx.tripId, paymentMethodId: ctx.renterPaymentMethodId, amountCents: 25000 },
    token: svc,
  });
  assertField(preauthDeposit.body, 'status', 'held', 'Service pre-authorizes deposit hold');
  ctx.depositId = preauthDeposit.body.id;

  const partialCapture = await testRequest({
    method: 'POST',
    url: `/payments/deposits/${ctx.depositId}/partial-capture`,
    data: { amountCents: 5000, reason: 'Minor cleaning fee assessed during smoke test.' },
    token: svc,
  });
  assertField(partialCapture.body, 'status', 'partially_captured', 'Partial deposit capture for a fee');

  const overCapture = await testRequest({
    method: 'POST',
    url: `/payments/deposits/${ctx.depositId}/partial-capture`,
    data: { amountCents: 999999, reason: 'Should fail -- exceeds remaining hold' },
    token: svc,
  });
  assert(overCapture.status === 400, 'Capturing more than the deposit hold amount is rejected', `status=${overCapture.status}`);

  const releaseDeposit = await testRequest({ method: 'POST', url: `/payments/deposits/${ctx.depositId}/release`, token: svc });
  assertField(releaseDeposit.body, 'status', 'released', 'Release remaining deposit');

  const payout = await testRequest({
    method: 'POST',
    url: '/payments/payouts',
    data: { ownerId: ctx.ownerId, tripId: ctx.tripId, amountCents: 8500, platformFeeCents: 1500 },
    token: svc,
  });
  assertField(payout.body, 'status', 'scheduled', 'Service schedules owner payout');
  ctx.payoutId = payout.body.id;

  const getPayout = await testRequest({ method: 'GET', url: `/payments/payouts/${ctx.payoutId}`, token: owner });
  assertField(getPayout.body, 'amountCents', 8500, 'Get payout');

  const ledger = await testRequest({ method: 'GET', url: `/payments/transactions/${ctx.tripId}`, token: owner });
  assertIsArray(ledger.body, 'Trip transaction ledger', 1);

  const webhookCallback = await testRequest({
    method: 'POST',
    url: '/payments/webhooks/processor-callback',
    data: { eventType: 'payout.paid', payload: { payoutId: ctx.payoutId } },
    token: svc,
  });
  assertStatus(webhookCallback, [200, 201], 'Processor webhook: payout.paid');
}
