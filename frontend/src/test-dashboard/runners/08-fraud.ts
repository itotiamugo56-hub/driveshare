import { TestContext } from '../ctx';
import { testRequest, assert, assertStatus, assertField, assertFieldNotNull, setDomain, newTestEmail, skip } from '../helpers';

export async function runFraud(ctx: TestContext) {
  setDomain('Fraud Detection');
  const renter = ctx.renterToken;

  const deviceSignal = await testRequest({
    method: 'POST',
    url: '/fraud/signals/device',
    data: { userId: ctx.renterId, deviceFingerprint: 'smoke-test-device-001', behavioralBiometricScore: 0.92, ipGeoMismatchFlag: false },
    token: renter,
  });
  assertStatus(deviceSignal, [200, 201], 'Submit device signal');

  if (!ctx.adminAvailable) {
    skip('Fraud: evaluate booking/listing, case triage, chargeback evidence (service/staff gated)', 'requires seeded admin');
    return;
  }
  const svc = ctx.serviceToken;

  const evalBookingAsUser = await testRequest({
    method: 'POST',
    url: '/fraud/evaluate/booking',
    data: { userId: ctx.renterId, listingId: ctx.listingId, tripId: ctx.tripId },
    token: renter,
  });
  assert(evalBookingAsUser.status === 403, 'Ordinary user CANNOT trigger a fraud evaluation (service only)', `status=${evalBookingAsUser.status}`);

  const evalBooking = await testRequest({
    method: 'POST',
    url: '/fraud/evaluate/booking',
    data: { userId: ctx.renterId, listingId: ctx.listingId, tripId: ctx.tripId, context: { highValueOrOneWay: false } },
    token: svc,
  });
  assertStatus(evalBooking, [200, 201], 'Service evaluates booking risk');
  assertField(evalBooking.body, 'decision', 'allow', 'Low-risk booking is allowed');

  const evalListing = await testRequest({
    method: 'POST',
    url: '/fraud/evaluate/listing',
    data: { listingId: ctx.listingId, ownerId: ctx.ownerId },
    token: svc,
  });
  assertStatus(evalListing, [200, 201], 'Service evaluates listing risk');

  const linkAnalysis = await testRequest({
    method: 'POST',
    url: '/fraud/link-analysis',
    data: { userIds: [ctx.ownerId, ctx.renterId] },
    token: ctx.adminToken,
  });
  assertFieldNotNull(linkAnalysis.body, 'linked', 'Link analysis runs without error');

  const chargebackEvidence = await testRequest({
    method: 'POST',
    url: '/fraud/chargeback-evidence',
    data: { tripId: ctx.tripId, includedArtifacts: ['contract.pdf', 'id_verification.json'] },
    token: svc,
  });
  assertField(chargebackEvidence.body, 'submittedToProcessor', true, 'Assemble + submit chargeback evidence bundle');
  ctx.bundleId = chargebackEvidence.body.id;

  const getBundle = await testRequest({ method: 'GET', url: `/fraud/chargeback-evidence/${ctx.bundleId}`, token: ctx.adminToken });
  assertField(getBundle.body, 'tripId', ctx.tripId, 'Get chargeback evidence bundle');

  // Fraud case lifecycle — deterministically drive a real 'block' decision by
  // replaying the actual signal combination: new account, velocity spike (>5
  // evaluations/24h), high-value/one-way flag, IP/geo mismatch.
  const fraudsterEmail = newTestEmail('fraudster');
  const fraudsterReg = await testRequest({ method: 'POST', url: '/auth/register', data: { email: fraudsterEmail, password: ctx.password } });
  ctx.fraudsterId = fraudsterReg.body.userId;

  for (let i = 0; i < 6; i++) {
    await testRequest({
      method: 'POST',
      url: '/fraud/evaluate/booking',
      data: { userId: ctx.fraudsterId, listingId: ctx.listingId, tripId: crypto.randomUUID() },
      token: svc,
    });
  }

  const blockTripId = crypto.randomUUID();
  const evalBlock = await testRequest({
    method: 'POST',
    url: '/fraud/evaluate/booking',
    data: { userId: ctx.fraudsterId, listingId: ctx.listingId, tripId: blockTripId, context: { highValueOrOneWay: true, ipGeoMismatchFlag: true } },
    token: svc,
  });
  assertField(evalBlock.body, 'decision', 'block', 'Combined signals (new account + velocity spike + high-value trip + IP/geo mismatch) correctly produce a BLOCK decision');
  assertField(evalBlock.body, 'signals.bookingVelocitySpike', 6, "Velocity-spike signal correctly counts this user's prior 24h evaluations");

  // The block decision opens a FraudCase but doesn't return its id directly —
  // find it via the moderation triage queue, its intended discovery path.
  const triageQueue = await testRequest({ method: 'GET', url: '/admin/moderation/fraud-triage-queue', token: ctx.adminToken });
  const queueArr: any[] = Array.isArray(triageQueue.body) ? triageQueue.body : [];
  const ourCase = queueArr.find((c) => Array.isArray(c.relatedUserIds) && c.relatedUserIds.includes(ctx.fraudsterId));
  assert(!!ourCase, 'Newly opened fraud case for the fraudster account appears in the triage queue', `queue=${JSON.stringify(queueArr)}`);
  ctx.fraudCaseId = ourCase?.id;

  const getCaseAsUser = await testRequest({ method: 'GET', url: `/fraud/cases/${ctx.fraudCaseId}`, token: renter });
  assert(getCaseAsUser.status === 403, 'Ordinary user CANNOT view a fraud case (support/admin only)', `status=${getCaseAsUser.status}`);

  const getCase = await testRequest({ method: 'GET', url: `/fraud/cases/${ctx.fraudCaseId}`, token: ctx.adminToken });
  assertField(getCase.body, 'status', 'open', 'Get fraud case detail');
  assertField(getCase.body, 'caseType', 'payment_fraud', 'Fraud case correctly typed as payment_fraud');

  const decideCaseAsUser = await testRequest({ method: 'POST', url: `/fraud/cases/${ctx.fraudCaseId}/decision`, data: { status: 'confirmed' }, token: renter });
  assert(decideCaseAsUser.status === 403, 'Ordinary user CANNOT decide a fraud case (support/admin only)', `status=${decideCaseAsUser.status}`);

  const decideCase = await testRequest({ method: 'POST', url: `/fraud/cases/${ctx.fraudCaseId}/decision`, data: { status: 'confirmed' }, token: ctx.adminToken });
  assertField(decideCase.body, 'status', 'confirmed', 'Admin confirms fraud case');
  assertFieldNotNull(decideCase.body, 'resolvedAt', 'Confirming a case sets resolvedAt');

  const getCaseAfterDecision = await testRequest({ method: 'GET', url: `/fraud/cases/${ctx.fraudCaseId}`, token: ctx.adminToken });
  assertField(getCaseAfterDecision.body, 'status', 'confirmed', 'Get fraud case reflects the decision');
}
