import { TestContext } from '../ctx';
import { testRequest, assert, assertField, assertFieldNotNull, assertIsArray, setDomain, newTestEmail, skip } from '../helpers';

export async function runAdminOps(ctx: TestContext) {
  setDomain('Admin & Operations');

  if (!ctx.adminAvailable) {
    skip(
      'ALL Admin & Operations assertions (staff, users-admin, assessments, monitoring, moderation, reporting, config, incidents)',
      "Seeded admin login failed at the top of this run. Run 'npm run seed' on the backend and re-run.",
    );
    return;
  }
  const admin = ctx.adminToken;
  const owner = ctx.ownerToken;

  // --- Staff & Permissions ---
  const supportEmail = newTestEmail('support');
  const arbEmail = newTestEmail('arb');

  const createSupport = await testRequest({ method: 'POST', url: '/admin/staff/accounts', data: { email: supportEmail, password: ctx.password, role: 'support_agent' }, token: admin });
  assertField(createSupport.body, 'role', 'support_agent', 'Admin creates support_agent account');
  ctx.supportId = createSupport.body.id;
  const supportLogin = await testRequest({ method: 'POST', url: '/auth/login', data: { email: supportEmail, password: ctx.password } });
  ctx.supportToken = supportLogin.body.accessToken;

  const createArb = await testRequest({ method: 'POST', url: '/admin/staff/accounts', data: { email: arbEmail, password: ctx.password, role: 'arbitrator' }, token: admin });
  assertField(createArb.body, 'role', 'arbitrator', 'Admin creates arbitrator account');
  const arbLogin = await testRequest({ method: 'POST', url: '/auth/login', data: { email: arbEmail, password: ctx.password } });
  ctx.arbitratorToken = arbLogin.body.accessToken;

  const createUserRoleStaff = await testRequest({ method: 'POST', url: '/admin/staff/accounts', data: { email: newTestEmail('bad'), password: ctx.password, role: 'user' }, token: admin });
  assert(createUserRoleStaff.status === 400, "Cannot create a plain 'user' role via the staff-account endpoint", `status=${createUserRoleStaff.status}`);

  const createStaffAsOwner = await testRequest({ method: 'POST', url: '/admin/staff/accounts', data: { email: newTestEmail('sneaky'), password: ctx.password, role: 'admin' }, token: owner });
  assert(createStaffAsOwner.status === 403, 'Ordinary user CANNOT create staff accounts (not even attempting self-promotion)', `status=${createStaffAsOwner.status}`);

  const listStaff = await testRequest({ method: 'GET', url: '/admin/staff/accounts', token: admin });
  assertIsArray(listStaff.body, 'List staff accounts', 2);

  const adminPerms = await testRequest({ method: 'GET', url: `/admin/staff/accounts/${ctx.adminId}/permissions`, token: admin });
  const permCount = Array.isArray(adminPerms.body) ? adminPerms.body.length : 0;
  assert(permCount === 11, 'Seeded admin holds exactly all 11 capabilities', `count=${permCount}; body=${JSON.stringify(adminPerms.body)}`);

  const grantToNonStaff = await testRequest({ method: 'POST', url: `/admin/staff/accounts/${ctx.ownerId}/permissions/resolve_disputes`, token: admin });
  assert(grantToNonStaff.status === 400, "Cannot grant a managerial capability to a plain 'user' account", `status=${grantToNonStaff.status}`);

  const grantCap = await testRequest({ method: 'POST', url: `/admin/staff/accounts/${ctx.supportId}/permissions/resolve_disputes`, token: admin });
  assertField(grantCap.body, 'capability', 'resolve_disputes', 'Grant a capability to support agent');

  const revokeCap = await testRequest({
    method: 'POST',
    url: `/admin/staff/accounts/${ctx.supportId}/permissions/resolve_disputes/revoke`,
    data: { reason: 'Smoke test: validating grant/revoke round-trip.' },
    token: admin,
  });
  assertFieldNotNull(revokeCap.body, 'revokedAt', 'Revoke a capability');

  const permsAfterRevoke = await testRequest({ method: 'GET', url: `/admin/staff/accounts/${ctx.supportId}/permissions`, token: admin });
  const stillHasIt = (Array.isArray(permsAfterRevoke.body) ? permsAfterRevoke.body : []).some((p: any) => p.capability === 'resolve_disputes');
  assert(!stillHasIt, 'Revoked capability no longer appears in active permission list', `body=${JSON.stringify(permsAfterRevoke.body)}`);

  const impersonateShortReason = await testRequest({ method: 'POST', url: '/admin/staff/impersonation/start', data: { targetUserId: ctx.ownerId, reason: 'short' }, token: admin });
  assert(impersonateShortReason.status === 400, 'Impersonation with insufficient reason is rejected', `status=${impersonateShortReason.status}`);

  const impersonate = await testRequest({
    method: 'POST',
    url: '/admin/staff/impersonation/start',
    data: { targetUserId: ctx.ownerId, reason: 'Investigating a support ticket about a listing issue (smoke test).' },
    token: admin,
  });
  assertFieldNotNull(impersonate.body, 'startedAt', 'Start impersonation session');
  ctx.impersonationSessionId = impersonate.body.id;

  const endImpersonateWrongStaff = await testRequest({ method: 'POST', url: `/admin/staff/impersonation/${ctx.impersonationSessionId}/end`, token: ctx.supportToken });
  assert(endImpersonateWrongStaff.status === 403, "A different staff member CANNOT end someone else's impersonation session", `status=${endImpersonateWrongStaff.status}`);

  const endImpersonate = await testRequest({ method: 'POST', url: `/admin/staff/impersonation/${ctx.impersonationSessionId}/end`, token: admin });
  assertFieldNotNull(endImpersonate.body, 'endedAt', 'Originating staff member ends their own impersonation session');

  const listImpersonation = await testRequest({ method: 'GET', url: '/admin/staff/impersonation', token: admin });
  assertIsArray(listImpersonation.body, 'List impersonation sessions', 1);

  // --- User & Vehicle Admin ---
  const profile = await testRequest({ method: 'GET', url: `/admin/users/${ctx.ownerId}/profile`, token: admin });
  assertField(profile.body, 'user.email', ctx.ownerEmail, 'Consolidated profile matches owner');
  assert((profile.body?.vehiclesOwned ?? 0) >= 1, 'Consolidated profile reports vehicle ownership', `vehiclesOwned=${profile.body?.vehiclesOwned}`);

  const profileAsOwner = await testRequest({ method: 'GET', url: `/admin/users/${ctx.ownerId}/profile`, token: owner });
  assert(profileAsOwner.status === 403, 'Ordinary user CANNOT view the admin consolidated-profile endpoint (even their own)', `status=${profileAsOwner.status}`);

  const overrideScore = await testRequest({
    method: 'POST',
    url: `/admin/users/${ctx.ownerId}/trust-score/override`,
    data: { newScore: 750, reason: 'Smoke test manual override to validate audit trail.' },
    token: admin,
  });
  assertField(overrideScore.body, 'overallScore', 750, 'Manually override trust score');

  const scoreAfterOverride = await testRequest({ method: 'GET', url: `/trust/users/${ctx.ownerId}/score`, token: owner });
  assertField(scoreAfterOverride.body, 'overallScore', 750, 'Override persisted and visible via the Trust Score service');

  const suspend = await testRequest({ method: 'POST', url: `/admin/users/${ctx.renterId}/suspend`, data: { reason: 'Smoke test suspension.' }, token: admin });
  assertFieldNotNull(suspend.body, 'suspendedBy', 'Suspend user');

  const doubleSuspend = await testRequest({ method: 'POST', url: `/admin/users/${ctx.renterId}/suspend`, data: { reason: 'Should fail -- already suspended' }, token: admin });
  assert(doubleSuspend.status === 400, 'Cannot suspend an already-suspended user', `status=${doubleSuspend.status}`);

  const profileWhileSuspended = await testRequest({ method: 'GET', url: `/admin/users/${ctx.renterId}/profile`, token: admin });
  assertField(profileWhileSuspended.body, 'suspended', true, 'Consolidated profile reflects active suspension');

  const unsuspend = await testRequest({ method: 'POST', url: `/admin/users/${ctx.renterId}/unsuspend`, token: admin });
  assertFieldNotNull(unsuspend.body, 'liftedAt', 'Unsuspend user');

  const doubleUnsuspend = await testRequest({ method: 'POST', url: `/admin/users/${ctx.renterId}/unsuspend`, token: admin });
  assert(doubleUnsuspend.status === 400, "Cannot unsuspend a user who isn't currently suspended", `status=${doubleUnsuspend.status}`);

  const forceReverify = await testRequest({ method: 'POST', url: `/admin/users/${ctx.ownerId}/force-reverification`, token: admin });
  assertField(forceReverify.body, 'status', 'reverification_forced', 'Force re-verification');

  const suspendVehicle = await testRequest({ method: 'POST', url: `/admin/users/vehicles/${ctx.vehicleId}/suspend`, data: { reason: 'Smoke test vehicle suspension.' }, token: admin });
  assertFieldNotNull(suspendVehicle.body, 'suspendedBy', 'Suspend vehicle');

  const vehicleAfterSuspend = await testRequest({ method: 'GET', url: `/vehicles/${ctx.vehicleId}`, token: owner });
  assertField(vehicleAfterSuspend.body, 'status', 'suspended', 'Vehicle status reflects suspension');

  const thresholdOverride = await testRequest({
    method: 'POST',
    url: `/admin/users/listings/${ctx.listingId}/threshold-override`,
    data: { minimumScore: 500, minimumTier: 'standard', reason: 'Smoke test threshold override.' },
    token: admin,
  });
  assertField(thresholdOverride.body, 'minimumScore', 500, 'Override listing trust threshold');

  // --- Assessments ---
  const userRisk = await testRequest({ method: 'GET', url: '/admin/assessments/user-risk', token: admin });
  assertIsArray(userRisk.body?.trustTierDistribution, 'User risk assessment: tier distribution');

  const vehicleQuality = await testRequest({ method: 'GET', url: `/admin/assessments/vehicle-quality/${ctx.vehicleId}`, token: admin });
  assert((vehicleQuality.body?.conditionBaselineCount ?? 0) >= 1, 'Vehicle quality assessment counts condition baselines', `count=${vehicleQuality.body?.conditionBaselineCount}`);

  const scorecard = await testRequest({ method: 'GET', url: `/admin/assessments/performance-scorecard/${ctx.ownerId}`, token: admin });
  assertField(scorecard.body, 'userId', ctx.ownerId, 'Performance scorecard');

  const financialHealth = await testRequest({ method: 'GET', url: '/admin/assessments/financial-health', token: admin });
  assertIsArray(financialHealth.body?.ledgerTotalsByType, 'Financial health (requires view_financials capability)');

  const financialHealthAsSupport = await testRequest({ method: 'GET', url: '/admin/assessments/financial-health', token: ctx.supportToken });
  assert(financialHealthAsSupport.status === 403, 'Support agent WITHOUT view_financials capability is blocked', `status=${financialHealthAsSupport.status}`);

  const regionalMarket = await testRequest({ method: 'GET', url: '/admin/assessments/regional-market', token: admin });
  assert(regionalMarket.body?.activeListings != null, 'Regional market assessment returns activeListings', `body=${JSON.stringify(regionalMarket.body)}`);

  const compliance = await testRequest({ method: 'GET', url: '/admin/assessments/compliance', token: admin });
  assertFieldNotNull(compliance.body, 'openDataLifecycleRequests', 'Compliance assessment');

  const vendorIntegrations = await testRequest({ method: 'GET', url: '/admin/assessments/vendor-integrations', token: admin });
  const vendorArr = Array.isArray(vendorIntegrations.body) ? vendorIntegrations.body : [];
  assert(vendorArr.length === 10, 'Vendor integration assessment reports all 10 tracked vendors', `count=${vendorArr.length}`);
  const allMocked = vendorArr.every((v: any) => v.mode === 'mock');
  assert(allMocked, "All vendor integrations correctly report 'mock' mode in this environment", `body=${JSON.stringify(vendorArr)}`);

  // --- Monitoring ---
  const fraudFeed = await testRequest({ method: 'GET', url: '/admin/monitoring/fraud', token: admin });
  assertField(fraudFeed.body, 'windowHours', 24, 'Fraud monitoring feed');

  const disputeFeed = await testRequest({ method: 'GET', url: '/admin/monitoring/disputes', token: admin });
  assertIsArray(disputeFeed.body?.byTierAndStatus, 'Dispute monitoring feed');

  const fleetFeed = await testRequest({ method: 'GET', url: '/admin/monitoring/fleet-access', token: admin });
  assertFieldNotNull(fleetFeed.body, 'activeDigitalKeys', 'Fleet/access monitoring feed');

  const paymentsFeed = await testRequest({ method: 'GET', url: '/admin/monitoring/payments', token: admin });
  assertFieldNotNull(paymentsFeed.body, 'depositsCurrentlyHeld', 'Payments monitoring feed');

  const insuranceFeed = await testRequest({ method: 'GET', url: '/admin/monitoring/insurance-claims', token: admin });
  assertIsArray(insuranceFeed.body?.claimsByStatus, 'Insurance claims monitoring feed');

  const systemHealth = await testRequest({ method: 'GET', url: '/admin/monitoring/system-health', token: admin });
  assertField(systemHealth.body, 'status', 'ok', 'System health feed');

  const trustTrends = await testRequest({ method: 'GET', url: '/admin/monitoring/trust-trends', token: admin });
  assertIsArray(trustTrends.body?.tierDistribution, 'Trust trends feed');

  const monitoringAsOwner = await testRequest({ method: 'GET', url: '/admin/monitoring/fraud', token: owner });
  assert(monitoringAsOwner.status === 403, 'Ordinary user CANNOT access monitoring feeds', `status=${monitoringAsOwner.status}`);

  // --- Moderation ---
  const flagItem = await testRequest({
    method: 'POST',
    url: '/admin/moderation/flag',
    data: { itemType: 'review', itemId: ctx.review1Id, flaggedReason: 'Smoke test: suspected retaliatory content.' },
    token: admin,
  });
  assertField(flagItem.body, 'status', 'pending', 'Flag a review for moderation');
  ctx.moderationItemId = flagItem.body.id;

  const queue = await testRequest({ method: 'GET', url: '/admin/moderation/queue', params: { status: 'pending' }, token: admin });
  const inQueue = (Array.isArray(queue.body) ? queue.body : []).some((q: any) => q.id === ctx.moderationItemId);
  assert(inQueue, 'Flagged item appears in the pending moderation queue', `queue=${JSON.stringify(queue.body)}`);

  const resolveItem = await testRequest({
    method: 'POST',
    url: `/admin/moderation/queue/${ctx.moderationItemId}/resolve`,
    data: { status: 'approved', reason: 'Smoke test: reviewed and found compliant.' },
    token: admin,
  });
  assertField(resolveItem.body, 'status', 'approved', 'Resolve moderation queue item');
  assertFieldNotNull(resolveItem.body, 'resolvedBy', 'Resolution records the resolving staff member');

  const fraudTriage = await testRequest({ method: 'GET', url: '/admin/moderation/fraud-triage-queue', token: admin });
  assertIsArray(fraudTriage.body, 'Fraud triage queue');

  const workbench = await testRequest({ method: 'GET', url: '/admin/moderation/dispute-mediator-workbench', token: admin });
  const workbenchHasFixture = (Array.isArray(workbench.body) ? workbench.body : []).some((d: any) => d.id === ctx.workbenchDisputeId);
  assert(workbenchHasFixture, 'Dispute mediator workbench includes the still-open fixture dispute from Dispute Resolution section', `workbench=${JSON.stringify(workbench.body)}`);

  const moderationAsOwner = await testRequest({ method: 'GET', url: '/admin/moderation/queue', token: owner });
  assert(moderationAsOwner.status === 403, 'Ordinary user CANNOT access the moderation queue', `status=${moderationAsOwner.status}`);

  // --- Reporting ---
  const startDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const endDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const revenue = await testRequest({ method: 'GET', url: '/admin/reporting/revenue', params: { startDate, endDate }, token: admin });
  assert((revenue.body?.entryCount ?? 0) >= 1, 'Revenue report captures ledger entries created earlier in this run', `entryCount=${revenue.body?.entryCount}`);

  const payoutRecon = await testRequest({ method: 'GET', url: '/admin/reporting/payout-reconciliation', params: { startDate, endDate }, token: admin });
  assertFieldNotNull(payoutRecon.body, 'payoutCount', 'Payout reconciliation report');

  const ownerEarnings = await testRequest({ method: 'GET', url: `/admin/reporting/owner-earnings/${ctx.ownerId}`, params: { year: new Date().getFullYear() }, token: admin });
  assertField(ownerEarnings.body, 'ownerId', ctx.ownerId, 'Owner earnings export');

  const insuranceAudit = await testRequest({ method: 'GET', url: `/admin/reporting/insurance-pricing-audit/${ctx.tripId}`, token: admin });
  assertField(insuranceAudit.body, 'boundPolicy.tripId', ctx.tripId, 'Insurance pricing audit trail matches the bound policy');

  const gdprReport = await testRequest({ method: 'GET', url: '/admin/reporting/gdpr-compliance', params: { startDate, endDate }, token: admin });
  assert((gdprReport.body?.requestCount ?? 0) >= 1, 'GDPR compliance report captures the export/delete requests from Data Security & Compliance', `requestCount=${gdprReport.body?.requestCount}`);

  const auditLogQuery = await testRequest({ method: 'GET', url: '/admin/reporting/audit-log', params: { actorId: ctx.adminId }, token: admin });
  assertIsArray(auditLogQuery.body, 'Managerial audit-log query', 1);

  const revenueAsSupport = await testRequest({ method: 'GET', url: '/admin/reporting/revenue', params: { startDate, endDate }, token: ctx.supportToken });
  assert(revenueAsSupport.status === 403, 'Support agent CANNOT access financial reporting (admin-only controller)', `status=${revenueAsSupport.status}`);

  // --- Configuration ---
  const setWeights = await testRequest({
    method: 'PUT',
    url: '/admin/config/settings/trust_score.weights',
    data: { value: { verification: 0.4, tripHistory: 0.2, behavior: 0.2, disputes: 0.1, fraud: 0.1 } },
    token: admin,
  });
  assertField(setWeights.body, 'value.verification', 0.4, 'Set Trust Score algorithm weights');

  const getWeights = await testRequest({ method: 'GET', url: '/admin/config/settings/trust_score.weights', token: admin });
  assertField(getWeights.body, 'value.verification', 0.4, 'Get Trust Score algorithm weights');

  const listConfig = await testRequest({ method: 'GET', url: '/admin/config/settings', token: admin });
  assertIsArray(listConfig.body, 'List all config settings', 1);

  const setFlag = await testRequest({
    method: 'PUT',
    url: '/admin/config/feature-flags/instant_book_enabled',
    data: { enabled: true, scopeRegion: 'global', description: 'Smoke test flag' },
    token: admin,
  });
  assertField(setFlag.body, 'enabled', true, 'Set feature flag');

  const getFlag = await testRequest({ method: 'GET', url: '/admin/config/feature-flags/instant_book_enabled', token: admin });
  assertField(getFlag.body, 'enabled', true, 'Get feature flag');

  const listFlags = await testRequest({ method: 'GET', url: '/admin/config/feature-flags', token: admin });
  assertIsArray(listFlags.body, 'List feature flags', 1);

  const configSurgeCap = await testRequest({ method: 'PUT', url: '/admin/config/surge-caps/sf-bay', data: { maxMultiplier: 3.0 }, token: admin });
  assertField(configSurgeCap.body, 'maxMultiplier', 3, 'Config module overwrites the same surge-cap table used by the Pricing Engine');

  const configAsOwner = await testRequest({ method: 'GET', url: '/admin/config/feature-flags', token: owner });
  assert(configAsOwner.status === 403, 'Ordinary user CANNOT read config settings', `status=${configAsOwner.status}`);

  // --- Incidents & Alerting ---
  const createIncident = await testRequest({
    method: 'POST',
    url: '/admin/incidents',
    data: { title: 'Smoke Test Incident', severity: 'p3', description: 'Synthetic incident created by the smoke test.', affectedServices: ['payments-escrow'] },
    token: admin,
  });
  assertField(createIncident.body, 'status', 'open', 'Create incident');
  ctx.incidentId = createIncident.body.id;

  const listIncidents = await testRequest({ method: 'GET', url: '/admin/incidents', token: admin });
  const incidentFound = (Array.isArray(listIncidents.body) ? listIncidents.body : []).some((i: any) => i.id === ctx.incidentId);
  assert(incidentFound, 'Created incident appears in the incident list', `list=${JSON.stringify(listIncidents.body)}`);

  const getIncident = await testRequest({ method: 'GET', url: `/admin/incidents/${ctx.incidentId}`, token: admin });
  assertField(getIncident.body, 'title', 'Smoke Test Incident', 'Get incident by id');

  const resolveIncident = await testRequest({ method: 'PUT', url: `/admin/incidents/${ctx.incidentId}/status`, data: { status: 'resolved' }, token: admin });
  assertFieldNotNull(resolveIncident.body, 'resolvedAt', 'Resolve incident sets resolvedAt');

  const createRule = await testRequest({
    method: 'POST',
    url: '/admin/incidents/alert-rules',
    data: { name: 'Smoke Test Always-Fires Rule', metric: 'payments.auth_failures_24h', comparator: 'gte', threshold: 0, notifyChannel: '#smoke-test' },
    token: admin,
  });
  assertField(createRule.body, 'enabled', true, 'Create alert rule (deterministically always-firing: threshold 0, gte)');
  ctx.alertRuleId = createRule.body.id;

  const listRules = await testRequest({ method: 'GET', url: '/admin/incidents/alert-rules/list', token: admin });
  const ruleFound = (Array.isArray(listRules.body) ? listRules.body : []).some((r: any) => r.id === ctx.alertRuleId);
  assert(ruleFound, 'Created alert rule appears in the rule list', `list=${JSON.stringify(listRules.body)}`);

  const evaluate = await testRequest({
    method: 'POST',
    url: '/admin/incidents/alert-rules/evaluate',
    data: { 'payments.auth_failures_24h': 0, 'fraud.blocked_bookings_24h': 0, 'payments.payout_backlog': 0, 'disputes.sla_at_risk_count': 0 },
    token: admin,
  });
  const fired = (Array.isArray(evaluate.body?.fired) ? evaluate.body.fired : []).some((f: any) => f.alertRuleId === ctx.alertRuleId);
  assert(fired, 'Always-firing alert rule actually fires on evaluation', `evaluate=${JSON.stringify(evaluate.body)}`);

  const listFirings = await testRequest({ method: 'GET', url: '/admin/incidents/alert-firings/list', token: admin });
  assertIsArray(listFirings.body, 'List alert firings', 1);
  ctx.alertFiringId = (Array.isArray(listFirings.body) ? listFirings.body[0] : undefined)?.id;

  const ackFiring = await testRequest({ method: 'PUT', url: `/admin/incidents/alert-firings/${ctx.alertFiringId}/acknowledge`, token: admin });
  assertFieldNotNull(ackFiring.body, 'acknowledgedAt', 'Acknowledge alert firing');

  const toggleRule = await testRequest({ method: 'PUT', url: `/admin/incidents/alert-rules/${ctx.alertRuleId}/toggle`, data: { enabled: false }, token: admin });
  assertField(toggleRule.body, 'enabled', false, 'Disable alert rule');

  const incidentsAsSupport = await testRequest({ method: 'POST', url: '/admin/incidents', data: { title: 'x', severity: 'p4', description: 'x', affectedServices: [] }, token: ctx.supportToken });
  assert(incidentsAsSupport.status === 403, 'Support agent WITHOUT manage_incidents capability CANNOT create incidents', `status=${incidentsAsSupport.status}`);

  const incidentsAsOwner = await testRequest({ method: 'GET', url: '/admin/incidents', token: owner });
  assert(incidentsAsOwner.status === 403, 'Ordinary user CANNOT access incidents at all', `status=${incidentsAsOwner.status}`);
}
