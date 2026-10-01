import { TestContext } from '../ctx';
import { testRequest, assert, assertStatus, assertField, assertFieldNotNull, assertIsArray, setDomain, toBase64, skip } from '../helpers';

function fromBase64(s: string) {
  try {
    return atob(s);
  } catch {
    return '';
  }
}

export async function runSecurityCompliance(ctx: TestContext) {
  setDomain('Data Security & Compliance');
  const owner = ctx.ownerToken;
  const renter = ctx.renterToken;

  const tokenizeDoc = await testRequest({
    method: 'POST',
    url: '/security/documents/tokenize',
    data: { documentClass: 'other', plaintextBase64: toBase64('top-secret-smoke-test-content') },
    token: owner,
  });
  assertStatus(tokenizeDoc, [200, 201], 'Tokenize a document');
  assertFieldNotNull(tokenizeDoc.body, 'token', 'Tokenize a document');
  ctx.docToken = tokenizeDoc.body.token;

  const readAsOwner = await testRequest({ method: 'GET', url: `/security/documents/${ctx.docToken}`, token: owner });
  assertStatus(readAsOwner, [200], 'Owner reads own tokenized document');
  const decoded = fromBase64(readAsOwner.body?.plaintextBase64 ?? '');
  assert(decoded === 'top-secret-smoke-test-content', 'Decrypted document content round-trips correctly', `decoded='${decoded}'`);

  const readAsRenter = await testRequest({ method: 'GET', url: `/security/documents/${ctx.docToken}`, token: renter });
  assert(readAsRenter.status === 403, "Non-owner (non-staff) CANNOT read someone else's tokenized document", `status=${readAsRenter.status}`);

  if (ctx.adminAvailable) {
    const readAsAdmin = await testRequest({ method: 'GET', url: `/security/documents/${ctx.docToken}`, token: ctx.adminToken });
    assertStatus(readAsAdmin, [200], 'Admin/support CAN read any tokenized document (audited access)');
  } else {
    skip('Admin reads tokenized document', 'requires seeded admin token');
  }

  const deleteDoc = await testRequest({ method: 'DELETE', url: `/security/documents/${ctx.docToken}`, token: owner });
  assertField(deleteDoc.body, 'deleted', true, 'Owner deletes own document');

  const readAfterDelete = await testRequest({ method: 'GET', url: `/security/documents/${ctx.docToken}`, token: owner });
  assert(readAfterDelete.status === 404, 'Reading a deleted document returns 404', `status=${readAfterDelete.status}`);

  const recordConsent = await testRequest({ method: 'POST', url: '/security/consent', data: { consentType: 'marketing' }, token: owner });
  assertStatus(recordConsent, [200, 201], 'Record consent');

  const listConsent = await testRequest({ method: 'GET', url: `/security/consent/${ctx.ownerId}`, token: owner });
  assertIsArray(listConsent.body, 'List consents', 1);

  const exportRequest = await testRequest({ method: 'POST', url: '/security/data-requests/export', token: owner });
  assertField(exportRequest.body, 'status', 'pending', 'Request data export');
  ctx.exportRequestId = exportRequest.body.id;

  const exportStatus = await testRequest({ method: 'GET', url: `/security/data-requests/${ctx.exportRequestId}/status`, token: owner });
  assertField(exportStatus.body, 'status', 'pending', 'Get export request status');

  // Deletion is tested on the throwaway account with no disputes/claims/legal holds
  // so the clean-path outcome is deterministic.
  const deleteRequest = await testRequest({ method: 'POST', url: '/security/data-requests/delete', token: ctx.deleteMeToken });
  assertField(deleteRequest.body, 'status', 'completed', 'Data deletion completes cleanly for a user with no holds');

  if (ctx.adminAvailable) {
    const auditLogAsAdmin = await testRequest({ method: 'GET', url: '/security/audit-log', token: ctx.adminToken });
    assertIsArray(auditLogAsAdmin.body, 'Admin queries document-access audit log');
    const auditLogAsOwner = await testRequest({ method: 'GET', url: '/security/audit-log', token: owner });
    assert(auditLogAsOwner.status === 403, 'Ordinary user CANNOT query the audit log', `status=${auditLogAsOwner.status}`);
  } else {
    skip('Query document-access audit log', 'requires seeded admin token');
  }
}
