import { TestContext } from '../ctx';
import { testRequest, assert, assertStatus, assertField, assertFieldNotNull, setDomain, skip } from '../helpers';

export async function runDispute(ctx: TestContext) {
  setDomain('Dispute Resolution');
  const owner = ctx.ownerToken;
  const renter = ctx.renterToken;

  // Case A: 'damage' dispute WITH pre/post baselines -> should auto-resolve (mock CV finds no new damage).
  await testRequest({ method: 'POST', url: `/vehicles/${ctx.vehicleId}/condition-baseline`, data: { type: 'pre_trip', tripId: ctx.tripId, mediaAssetRefs: ['pre1.jpg'] }, token: owner });
  await testRequest({ method: 'POST', url: `/vehicles/${ctx.vehicleId}/condition-baseline`, data: { type: 'post_trip', tripId: ctx.tripId, mediaAssetRefs: ['post1.jpg'] }, token: renter });

  const damageDispute = await testRequest({ method: 'POST', url: '/disputes', data: { tripId: ctx.tripId, disputeType: 'damage' }, token: owner });
  assertStatus(damageDispute, [200, 201], 'File damage dispute (with baselines present)');
  assertField(damageDispute.body, 'status', 'resolved_auto', 'Damage dispute auto-resolves when CV comparison finds no new damage');
  ctx.damageDisputeId = damageDispute.body.id;

  const getDamageDispute = await testRequest({ method: 'GET', url: `/disputes/${ctx.damageDisputeId}`, token: owner });
  assertField(getDamageDispute.body, 'status', 'resolved_auto', 'Get auto-resolved dispute');

  if (!ctx.adminAvailable) {
    skip('Direct calls to auto-resolve-attempt / escalate (service/support-role gated)', 'requires seeded admin to mint a service token');
  } else {
    const svc = ctx.serviceToken;

    const autoResolveAsOwner = await testRequest({ method: 'POST', url: `/disputes/${ctx.damageDisputeId}/auto-resolve-attempt`, token: owner });
    assert(autoResolveAsOwner.status === 403, 'A party to the dispute CANNOT directly trigger auto-resolve-attempt (service only)', `status=${autoResolveAsOwner.status}`);

    const autoResolveAsAdmin = await testRequest({ method: 'POST', url: `/disputes/${ctx.damageDisputeId}/auto-resolve-attempt`, token: ctx.adminToken });
    assert(autoResolveAsAdmin.status === 403, 'Even an admin CANNOT directly trigger auto-resolve-attempt (strictly service-role only, not admin)', `status=${autoResolveAsAdmin.status}`);

    const autoResolveDirect = await testRequest({ method: 'POST', url: `/disputes/${ctx.damageDisputeId}/auto-resolve-attempt`, token: svc });
    assertField(autoResolveDirect.body, 'status', 'resolved_auto', 'Service directly re-invokes auto-resolve-attempt; result is idempotent');

    const escalateAsRenter = await testRequest({ method: 'POST', url: `/disputes/${ctx.damageDisputeId}/escalate`, token: renter });
    assert(escalateAsRenter.status === 403, 'Ordinary user CANNOT directly escalate a dispute (service/support_agent only)', `status=${escalateAsRenter.status}`);

    const escalateAsAdmin = await testRequest({ method: 'POST', url: `/disputes/${ctx.damageDisputeId}/escalate`, token: ctx.adminToken });
    assert(escalateAsAdmin.status === 403, 'Even a plain admin CANNOT escalate directly — scoped to service/support_agent specifically, not admin', `status=${escalateAsAdmin.status}`);

    const escalateDirect = await testRequest({ method: 'POST', url: `/disputes/${ctx.damageDisputeId}/escalate`, token: svc });
    assertField(escalateDirect.body, 'tier', 'mediator_review', 'Service manually escalates a previously auto-resolved dispute');

    const getAfterManualEscalate = await testRequest({ method: 'GET', url: `/disputes/${ctx.damageDisputeId}`, token: owner });
    assertField(getAfterManualEscalate.body, 'tier', 'mediator_review', 'Manual escalation persists');
    assertField(getAfterManualEscalate.body, 'status', 'resolved_auto', "Escalating tier does not itself change the dispute's resolution status (independent fields)");
  }

  // Case B: 'mileage' dispute (non-damage type) -> always escalates straight to mediator review.
  const tripId2 = crypto.randomUUID();
  const mileageDispute = await testRequest({ method: 'POST', url: '/disputes', data: { tripId: tripId2, disputeType: 'mileage' }, token: renter });
  assertField(mileageDispute.body, 'tier', 'mediator_review', 'Non-damage dispute type immediately escalates to mediator review');
  ctx.mileageDisputeId = mileageDispute.body.id;

  const addEvidence = await testRequest({ method: 'POST', url: `/disputes/${ctx.mileageDisputeId}/evidence`, data: { sourceType: 'user_submission', refPointer: 'odometer_photo.jpg' }, token: renter });
  assertStatus(addEvidence, [200, 201], 'Attach user evidence to dispute');

  if (ctx.adminAvailable) {
    const mediatorDecisionAsUser = await testRequest({
      method: 'POST',
      url: `/disputes/${ctx.mileageDisputeId}/mediator-decision`,
      data: { decisionSummary: 'trying to resolve my own dispute' },
      token: renter,
    });
    assert(mediatorDecisionAsUser.status === 403, 'A party to the dispute CANNOT record the mediator decision themselves', `status=${mediatorDecisionAsUser.status}`);

    const mediatorDecision = await testRequest({
      method: 'POST',
      url: `/disputes/${ctx.mileageDisputeId}/mediator-decision`,
      data: { decisionSummary: 'Reviewed odometer photos; discrepancy was within normal tolerance, no fault found.' },
      token: ctx.adminToken,
    });
    assertField(mediatorDecision.body, 'status', 'resolved_mediator', 'Mediator resolves dispute');

    // Case C: a third dispute escalated all the way to arbitration.
    const tripId3 = crypto.randomUUID();
    const arbDispute = await testRequest({ method: 'POST', url: '/disputes', data: { tripId: tripId3, disputeType: 'billing' }, token: owner });
    ctx.arbDisputeId = arbDispute.body.id;
    const handoff = await testRequest({ method: 'POST', url: `/disputes/${ctx.arbDisputeId}/arbitration-handoff`, token: ctx.adminToken });
    assertField(handoff.body, 'tier', 'arbitration', 'Dispute handed off to arbitration');

    const mediatorDecisionAfterArb = await testRequest({
      method: 'POST',
      url: `/disputes/${ctx.arbDisputeId}/mediator-decision`,
      data: { decisionSummary: 'Should be rejected -- already in arbitration' },
      token: ctx.adminToken,
    });
    assert(mediatorDecisionAfterArb.status === 400, 'Mediator decision is rejected once a dispute is in arbitration', `status=${mediatorDecisionAfterArb.status}`);

    // Case D: a fourth, deliberately UNRESOLVED mediator-tier dispute, left open for
    // the Admin & Operations dispute-mediator-workbench assertion.
    const tripId4 = crypto.randomUUID();
    const workbenchDispute = await testRequest({ method: 'POST', url: '/disputes', data: { tripId: tripId4, disputeType: 'cleanliness' }, token: renter });
    ctx.workbenchDisputeId = workbenchDispute.body.id;
    assertField(workbenchDispute.body, 'tier', 'mediator_review', 'Fixture dispute left open for moderation workbench check');
  } else {
    skip('Mediator decision / arbitration handoff', 'requires seeded admin/staff tokens');
  }

  const timeline = await testRequest({ method: 'GET', url: `/disputes/${ctx.damageDisputeId}/timeline`, token: owner });
  assertFieldNotNull(timeline.body, 'id', 'Get dispute timeline');
}
