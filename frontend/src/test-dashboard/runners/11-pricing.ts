import { TestContext } from '../ctx';
import { testRequest, assert, assertField, assertFieldNotNull, assertIsArray, assertNumberGreaterThan, setDomain, skip } from '../helpers';

export async function runPricing(ctx: TestContext) {
  setDomain('Pricing Engine');
  const owner = ctx.ownerToken;

  const priceSuggestion = await testRequest({ method: 'POST', url: '/pricing/suggestions', data: { listingId: ctx.listingId }, token: owner });
  assertNumberGreaterThan(priceSuggestion.body, 'suggestedPriceCents', 0, 'Price suggestion');

  const comparables = await testRequest({ method: 'GET', url: '/pricing/comparables', params: { region: 'default' }, token: owner });
  assertIsArray(comparables.body, 'Comparables');

  const earnings = await testRequest({ method: 'POST', url: '/pricing/earnings-breakdown', data: { tripId: ctx.tripId, grossTripPriceCents: 10000 }, token: owner });
  const expectedPlatformFee = Math.round((10000 * 1500) / 10000);
  const expectedNet = 10000 - expectedPlatformFee - (ctx.quotedPriceCents ?? 0);
  assertField(earnings.body, 'platformFeeCents', expectedPlatformFee, 'Earnings breakdown platform fee (15%)');
  assertField(earnings.body, 'insuranceCostCents', ctx.quotedPriceCents, 'Earnings breakdown picks up the real insurance quote for this trip');
  assertField(earnings.body, 'ownerNetCents', expectedNet, 'Earnings breakdown owner net = gross - fee - insurance');

  const idleRecs = await testRequest({ method: 'GET', url: `/pricing/idle-recommendations/${ctx.ownerId}`, token: owner });
  assertIsArray(idleRecs.body, 'Idle inventory recommendations', 1);

  const cancelRisk = await testRequest({ method: 'GET', url: `/pricing/cancellation-risk/${ctx.tripId}`, token: owner });
  assertFieldNotNull(cancelRisk.body, 'riskScore', 'Cancellation risk score');

  const surgeCapAsUser = await testRequest({ method: 'POST', url: '/pricing/surge-caps', data: { marketRegion: 'sf-bay', maxMultiplierBasisPoints: 250 }, token: owner });
  assert(surgeCapAsUser.status === 403, 'Ordinary user CANNOT set surge caps (admin only)', `status=${surgeCapAsUser.status}`);

  if (ctx.adminAvailable) {
    const surgeCap = await testRequest({ method: 'POST', url: '/pricing/surge-caps', data: { marketRegion: 'sf-bay', maxMultiplierBasisPoints: 250 }, token: ctx.adminToken });
    assertField(surgeCap.body, 'maxMultiplier', 2.5, 'Admin sets surge cap (250bps -> 2.5x)');
  } else {
    skip('Set surge cap', 'requires seeded admin token');
  }
}
