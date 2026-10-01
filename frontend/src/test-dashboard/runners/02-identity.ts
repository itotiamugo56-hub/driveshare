import { TestContext } from '../ctx';
import {
  testRequest,
  assert,
  assertStatus,
  assertField,
  assertFieldNotNull,
  setDomain,
  toBase64,
} from '../helpers';

export async function runIdentity(ctx: TestContext) {
  setDomain('Identity & Verification');
  const owner = ctx.ownerToken;

  const initVerif = await testRequest({ method: 'POST', url: '/identity/verifications', data: { documentType: 'drivers_license' }, token: owner });
  assertStatus(initVerif, [200, 201], 'Initiate verification');
  assertField(initVerif.body, 'status', 'pending', 'Initiate verification');
  ctx.verificationId = initVerif.body.id;

  const uploadDoc = await testRequest({
    method: 'POST',
    url: `/identity/verifications/${ctx.verificationId}/documents`,
    data: { documentBase64: toBase64('fake-id-image') },
    token: owner,
  });
  assertStatus(uploadDoc, [200, 201], 'Upload ID document');
  assertField(uploadDoc.body, 'status', 'doc_uploaded', 'Upload ID document');
  assertFieldNotNull(uploadDoc.body, 'vendorRef', 'Upload ID document (mocked vendor ref)');

  const liveness = await testRequest({
    method: 'POST',
    url: `/identity/verifications/${ctx.verificationId}/liveness`,
    data: { livenessMediaBase64: toBase64('fake-selfie') },
    token: owner,
  });
  assertStatus(liveness, [200, 201], 'Submit liveness');
  assertField(liveness.body, 'status', 'approved', 'Submit liveness (mock scores above threshold)');

  const getVerif = await testRequest({ method: 'GET', url: `/identity/verifications/${ctx.verificationId}`, token: owner });
  assertField(getVerif.body, 'status', 'approved', 'Get verification after approval');

  const submitLicense = await testRequest({
    method: 'POST',
    url: '/identity/licenses',
    data: {
      licenseNumber: `DL-${Math.random().toString(36).slice(2, 10)}`,
      issuingRegion: 'CA',
      licenseClass: 'C',
      expirationDate: new Date(Date.now() + 3 * 365 * 86400000).toISOString().slice(0, 10),
    },
    token: owner,
  });
  assertStatus(submitLicense, [200, 201], 'Submit license');
  assertField(submitLicense.body, 'dmvValidationStatus', 'valid', 'Submit license (mocked DMV)');
  ctx.licenseId = submitLicense.body.id;

  const licenseStatus = await testRequest({ method: 'GET', url: `/identity/licenses/${ctx.licenseId}/status`, token: owner });
  assertField(licenseStatus.body, 'dmvValidationStatus', 'valid', 'Get license status');

  const noConsentHistory = await testRequest({ method: 'POST', url: '/identity/driving-history', data: { consentGiven: false }, token: owner });
  assert(noConsentHistory.status === 400, 'Driving history request WITHOUT consent is rejected', `status=${noConsentHistory.status}`);

  const drivingHistory = await testRequest({ method: 'POST', url: '/identity/driving-history', data: { consentGiven: true }, token: owner });
  assertStatus(drivingHistory, [200, 201], 'Driving history request WITH consent');
  assertField(drivingHistory.body, 'riskTier', 'low', 'Driving history result (mocked)');
  assertFieldNotNull(drivingHistory.body, 'completedAt', 'Driving history completed synchronously');
  ctx.drivingHistoryId = drivingHistory.body.id;

  const getDrivingHistory = await testRequest({ method: 'GET', url: `/identity/driving-history/${ctx.drivingHistoryId}`, token: owner });
  assertField(getDrivingHistory.body, 'riskTier', 'low', 'Get driving history report');

  const reverifyAsUser = await testRequest({ method: 'POST', url: '/identity/reverifications/schedule', data: { userId: ctx.ownerId }, token: owner });
  assert(reverifyAsUser.status === 403, 'Ordinary user CANNOT trigger reverification scheduling (service/admin only)', `status=${reverifyAsUser.status}`);

  const identityStatus = await testRequest({ method: 'GET', url: `/identity/users/${ctx.ownerId}/status`, token: owner });
  assertField(identityStatus.body, 'identityVerified', true, 'Consolidated identity status');
  assertField(identityStatus.body, 'licenseStatus', 'valid', 'Consolidated identity status');

  const webhookAsUser = await testRequest({
    method: 'POST',
    url: '/identity/webhooks/vendor-callback',
    data: { verificationId: ctx.verificationId, status: 'approved' },
    token: owner,
  });
  assert(webhookAsUser.status === 403, 'Ordinary user CANNOT call vendor webhook endpoint (service only)', `status=${webhookAsUser.status}`);
}
