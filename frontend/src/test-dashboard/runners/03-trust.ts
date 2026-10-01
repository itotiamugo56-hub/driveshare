import { TestContext } from '../ctx';
import { testRequest, assert, assertStatus, assertField, assertFieldNotNull, setDomain } from '../helpers';

export async function runTrust(ctx: TestContext) {
  setDomain('Trust Score');
  const owner = ctx.ownerToken;

  const score = await testRequest({ method: 'GET', url: `/trust/users/${ctx.ownerId}/score`, token: owner });
  assertStatus(score, [200], 'Get trust score');
  assertFieldNotNull(score.body, 'tier', 'Get trust score');

  const recalcAsUser = await testRequest({ method: 'POST', url: `/trust/users/${ctx.ownerId}/recalculate`, token: owner });
  assert(recalcAsUser.status === 403, 'Ordinary user CANNOT force a trust recalculation (service/admin only)', `status=${recalcAsUser.status}`);

  const importHistory = await testRequest({
    method: 'POST',
    url: '/trust/imports/external-history',
    data: { sourcePlatform: 'rideshare_driver', verificationMethod: 'oauth_pull' },
    token: owner,
  });
  assertStatus(importHistory, [200, 201], 'Import external history');
  assertField(importHistory.body, 'status', 'verified', 'Import external history');
  ctx.importId = importHistory.body.id;

  const importStatus = await testRequest({ method: 'GET', url: `/trust/imports/${ctx.importId}/status`, token: owner });
  assertField(importStatus.body, 'status', 'verified', 'Get import status');
}

/** Revisited after a real listing exists — see runner 04. */
export async function runTrustThresholdsAgainstListing(ctx: TestContext) {
  setDomain('Trust Score');
  const owner = ctx.ownerToken;

  const setThreshold = await testRequest({
    method: 'PUT',
    url: `/trust/thresholds/${ctx.listingId}`,
    data: { minimumScore: 200, minimumTier: 'new' },
    token: owner,
  });
  assertField(setThreshold.body, 'minimumScore', 200, 'Set listing trust threshold');

  const getThreshold = await testRequest({ method: 'GET', url: `/trust/thresholds/${ctx.listingId}`, token: owner });
  assertField(getThreshold.body, 'minimumScore', 200, 'Get listing trust threshold');

  const eligibility = await testRequest({
    method: 'POST',
    url: '/trust/eligibility-check',
    data: { userId: ctx.renterId, listingId: ctx.listingId },
    token: owner,
  });
  assertField(eligibility.body, 'eligible', true, 'Renter meets low threshold (score 200, new renter starts at 300)');
}
