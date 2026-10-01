import { TestContext } from '../ctx';
import { testRequest, assert, assertStatus, assertField, assertFieldNull, assertIsArray, assertNumberGreaterThan, setDomain, skip } from '../helpers';

export async function runReviews(ctx: TestContext) {
  setDomain('Reviews & Reputation');
  const owner = ctx.ownerToken;
  const renter = ctx.renterToken;

  const review1 = await testRequest({ method: 'POST', url: '/reviews', data: { tripId: ctx.tripId, subjectUserId: ctx.renterId, rating: 5, comment: 'Great renter, smooth trip.' }, token: owner });
  assertStatus(review1, [200, 201], 'Owner reviews renter');
  ctx.review1Id = review1.body.id;

  const viewOwnReview = await testRequest({ method: 'GET', url: `/reviews/${ctx.tripId}`, token: owner });
  const mine = (Array.isArray(viewOwnReview.body) ? viewOwnReview.body : []).find((r: any) => r.id === ctx.review1Id);
  assertField(mine, 'rating', 5, 'Author can see their own unrevealed review content');

  const viewAsCounterpart = await testRequest({ method: 'GET', url: `/reviews/${ctx.tripId}`, token: renter });
  const masked = (Array.isArray(viewAsCounterpart.body) ? viewAsCounterpart.body : []).find((r: any) => r.id === ctx.review1Id);
  assertFieldNull(masked, 'rating', "Counterpart CANNOT see review content before submitting their own (blind review)");
  assertField(masked, 'visibility', 'hidden_pending_counterpart', 'Masked review still reports its visibility state');

  const duplicateReview = await testRequest({ method: 'POST', url: '/reviews', data: { tripId: ctx.tripId, subjectUserId: ctx.renterId, rating: 1, comment: 'trying to review twice' }, token: owner });
  assert(duplicateReview.status === 400, 'Author cannot submit a second review for the same trip', `status=${duplicateReview.status}`);

  const review2 = await testRequest({ method: 'POST', url: '/reviews', data: { tripId: ctx.tripId, subjectUserId: ctx.ownerId, rating: 4, comment: 'Good owner, smooth pickup.' }, token: renter });
  assertStatus(review2, [200, 201], 'Renter reviews owner (completes the pair -> should reveal both)');
  assertField(review2.body, 'visibility', 'visible', "Second review's own response reflects the just-triggered reveal");

  const viewAfterReveal = await testRequest({ method: 'GET', url: `/reviews/${ctx.tripId}`, token: renter });
  const revealed = (Array.isArray(viewAfterReveal.body) ? viewAfterReveal.body : []).find((r: any) => r.id === ctx.review1Id);
  assertField(revealed, 'rating', 5, 'Original review is now visible to the counterpart after both sides submitted');
  assertField(revealed, 'visibility', 'visible', "Original review's visibility flips to visible");

  const userHistory = await testRequest({ method: 'GET', url: `/reviews/users/${ctx.renterId}`, token: owner });
  assertNumberGreaterThan(userHistory.body, 'reviewCount', 0, "Renter's aggregated review history");

  const attachMedia = await testRequest({ method: 'POST', url: `/reviews/${ctx.review1Id}/media`, data: { mediaRefs: ['interior_photo.jpg'] }, token: owner });
  const mediaOk = Array.isArray(attachMedia.body?.mediaRefs) && attachMedia.body.mediaRefs.includes('interior_photo.jpg');
  assert(mediaOk, 'Attach media to a review', `mediaRefs=${JSON.stringify(attachMedia.body?.mediaRefs)}`);

  const badges = await testRequest({ method: 'GET', url: `/badges/users/${ctx.renterId}`, token: renter });
  assertIsArray(badges.body, 'Get badges (likely empty — under the 10-trip threshold)');

  if (ctx.adminAvailable && ctx.serviceToken) {
    const badgeEvalAsUser = await testRequest({ method: 'POST', url: '/badges/evaluate', data: { userId: ctx.renterId }, token: renter });
    assert(badgeEvalAsUser.status === 403, "Ordinary user CANNOT trigger their own badge evaluation (service only)", `status=${badgeEvalAsUser.status}`);

    const badgeEval = await testRequest({ method: 'POST', url: '/badges/evaluate', data: { userId: ctx.renterId }, token: ctx.serviceToken });
    assertField(badgeEval.body, 'eligible', false, 'Badge evaluation correctly reports not-yet-eligible (below trip threshold)');
  } else {
    skip('Badge evaluation', 'requires seeded admin/service token');
  }
}
