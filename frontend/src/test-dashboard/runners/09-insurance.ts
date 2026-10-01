import { TestContext } from '../ctx';
import { testRequest, assert, assertField, assertFieldNotNull, assertIsArray, assertNumberGreaterThan, setDomain, skip } from '../helpers';

export async function runInsurance(ctx: TestContext) {
  setDomain('Insurance & Liability');
  const owner = ctx.ownerToken;
  const renter = ctx.renterToken;

  const tiers = await testRequest({ method: 'GET', url: '/insurance/tiers', token: owner });
  assertIsArray(tiers.body, 'List coverage tiers (auto-seeded)', 3);
  const standardTier = (Array.isArray(tiers.body) ? tiers.body : []).find((t: any) => t.name === 'standard');
  assert(!!standardTier, 'Standard coverage tier exists', `tiers=${JSON.stringify(tiers.body)}`);
  ctx.standardTierId = standardTier?.id;

  const quote = await testRequest({
    method: 'POST',
    url: '/insurance/quotes',
    data: { tripId: ctx.tripId, tierId: ctx.standardTierId, riskFactors: { trustTier: 'new', drivingRiskTier: 'low' } },
    token: renter,
  });
  assertNumberGreaterThan(quote.body, 'quotedPriceCents', 0, 'Insurance quote price');
  ctx.quotedPriceCents = quote.body?.quotedPriceCents;

  const bindBeforeCheck = await testRequest({ method: 'POST', url: '/insurance/policies', data: { tripId: ctx.tripId, tierId: ctx.standardTierId }, token: renter });
  assert(bindBeforeCheck.status === 400, 'Cannot bind a policy before the comprehension check passes', `status=${bindBeforeCheck.status}`);

  const comprehensionCheck = await testRequest({
    method: 'POST',
    url: '/insurance/comprehension-check',
    data: {
      tripId: ctx.tripId,
      answers: [
        { questionId: 'deductible', answer: '750 dollars' },
        { questionId: 'liability_limit', answer: '50000000 cents' },
        { questionId: 'off_trip_coverage', answer: 'not covered outside trip window' },
      ],
    },
    token: renter,
  });
  assertField(comprehensionCheck.body, 'passed', true, 'Comprehension check with substantive answers passes');

  const bindPolicy = await testRequest({ method: 'POST', url: '/insurance/policies', data: { tripId: ctx.tripId, tierId: ctx.standardTierId }, token: renter });
  assertField(bindPolicy.body, 'status', 'bound', 'Bind policy after comprehension check passes');
  assertFieldNotNull(bindPolicy.body, 'carrierRef', 'Policy has mocked carrier reference');
  ctx.policyId = bindPolicy.body.id;

  const getPolicy = await testRequest({ method: 'GET', url: `/insurance/policies/${ctx.policyId}`, token: renter });
  assertField(getPolicy.body, 'tripId', ctx.tripId, 'Get bound policy');

  const fileClaim = await testRequest({ method: 'POST', url: '/insurance/claims', data: { policyId: ctx.policyId, tripId: ctx.tripId, claimType: 'vehicle_damage' }, token: owner });
  assertField(fileClaim.body, 'status', 'filed', 'File insurance claim');
  ctx.claimId = fileClaim.body.id;

  const attachEvidence = await testRequest({ method: 'POST', url: `/insurance/claims/${ctx.claimId}/evidence`, data: { evidenceRefs: ['post_trip_photo_1.jpg'] }, token: owner });
  assertField(attachEvidence.body, 'status', 'under_review', 'Attach evidence moves claim to under_review');

  const getClaimUnderReview = await testRequest({ method: 'GET', url: `/insurance/claims/${ctx.claimId}`, token: owner });
  assertField(getClaimUnderReview.body, 'status', 'under_review', 'Get claim reflects under_review state');
  const evidenceContainsRef = Array.isArray(getClaimUnderReview.body?.evidenceRefs) && getClaimUnderReview.body.evidenceRefs.includes('post_trip_photo_1.jpg');
  assert(evidenceContainsRef, 'Get claim returns the attached evidence ref', `evidenceRefs=${JSON.stringify(getClaimUnderReview.body?.evidenceRefs)}`);

  if (ctx.adminAvailable) {
    const decideAsOwner = await testRequest({ method: 'POST', url: `/insurance/claims/${ctx.claimId}/decision`, data: { status: 'approved', payoutAmountCents: 50000 }, token: owner });
    assert(decideAsOwner.status === 403, 'Claimant CANNOT decide their own claim (support/admin/service only)', `status=${decideAsOwner.status}`);

    const decideClaim = await testRequest({ method: 'POST', url: `/insurance/claims/${ctx.claimId}/decision`, data: { status: 'approved', payoutAmountCents: 50000 }, token: ctx.adminToken });
    assertField(decideClaim.body, 'status', 'approved', 'Admin decides claim');
    assertField(decideClaim.body, 'payoutAmountCents', 50000, 'Claim payout amount recorded');

    const getClaimApproved = await testRequest({ method: 'GET', url: `/insurance/claims/${ctx.claimId}`, token: owner });
    assertField(getClaimApproved.body, 'status', 'approved', 'Get claim reflects final approved state');
    assertField(getClaimApproved.body, 'payoutAmountCents', 50000, 'Get claim returns the recorded payout amount');
  } else {
    skip('Decide insurance claim', 'requires seeded admin token');
  }
}
