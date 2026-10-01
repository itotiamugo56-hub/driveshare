import { TestContext } from '../ctx';
import {
  testRequest,
  assert,
  assertStatus,
  assertField,
  assertFieldNotNull,
  setDomain,
  newTestEmail,
  info,
} from '../helpers';

export async function runAuth(ctx: TestContext) {
  setDomain('Auth');
  info('Registering owner / renter / delete-me fixture accounts');

  ctx.ownerEmail = newTestEmail('owner');
  ctx.renterEmail = newTestEmail('renter');
  const deleteMeEmail = newTestEmail('deleteme');

  const regOwner = await testRequest({ method: 'POST', url: '/auth/register', data: { email: ctx.ownerEmail, password: ctx.password } });
  assertStatus(regOwner, [200, 201], 'Register owner');
  assertFieldNotNull(regOwner.body, 'accessToken', 'Register owner');
  assertField(regOwner.body, 'role', 'user', 'Register owner');
  ctx.ownerToken = regOwner.body.accessToken;
  ctx.ownerId = regOwner.body.userId;

  const regRenter = await testRequest({ method: 'POST', url: '/auth/register', data: { email: ctx.renterEmail, password: ctx.password } });
  assertStatus(regRenter, [200, 201], 'Register renter');
  ctx.renterToken = regRenter.body.accessToken;
  ctx.renterId = regRenter.body.userId;

  const regDeleteMe = await testRequest({ method: 'POST', url: '/auth/register', data: { email: deleteMeEmail, password: ctx.password } });
  ctx.deleteMeToken = regDeleteMe.body.accessToken;
  ctx.deleteMeId = regDeleteMe.body.userId;

  const dupReg = await testRequest({ method: 'POST', url: '/auth/register', data: { email: ctx.ownerEmail, password: ctx.password } });
  // Previously this only asserted status >= 400, which silently let an unhandled
  // Prisma unique-constraint violation (500) pass as "rejected". Now that the
  // backend correctly maps that to a 409 Conflict (see auth.service.ts fix),
  // the test is tightened to require exactly that status.
  assert(dupReg.status === 409, 'Duplicate email registration is rejected with 409 Conflict (not an unhandled 500)', `status=${dupReg.status}`);

  const loginOwner = await testRequest({ method: 'POST', url: '/auth/login', data: { email: ctx.ownerEmail, password: ctx.password } });
  assertStatus(loginOwner, [200, 201], 'Login owner');
  assertFieldNotNull(loginOwner.body, 'accessToken', 'Login owner');

  const badLogin = await testRequest({ method: 'POST', url: '/auth/login', data: { email: ctx.ownerEmail, password: 'wrong-password' } });
  assert(badLogin.status === 401, 'Login with wrong password returns 401', `status=${badLogin.status}`);

  const loginAdmin = await testRequest({ method: 'POST', url: '/auth/login', data: { email: ctx.adminEmail, password: ctx.adminPassword } });
  ctx.adminAvailable = [200, 201].includes(loginAdmin.status) && !!loginAdmin.body?.accessToken;
  if (ctx.adminAvailable) {
    ctx.adminToken = loginAdmin.body.accessToken;
    ctx.adminId = loginAdmin.body.userId;
    assert(true, `Login seeded admin (${ctx.adminEmail})`);
  } else {
    assert(false, `Login seeded admin (${ctx.adminEmail})`, `status=${loginAdmin.status}. Did you run 'npm run seed'?`);
  }

  const noAuthAdminOps = await testRequest({ method: 'GET', url: '/admin/staff/accounts', token: ctx.ownerToken });
  assert(noAuthAdminOps.status === 403, 'Ordinary user cannot access /admin/staff (role gate)', `status=${noAuthAdminOps.status}`);

  const noTokenAtAll = await testRequest({ method: 'GET', url: `/trust/users/${ctx.ownerId}/score` });
  assert(noTokenAtAll.status === 401, 'Unauthenticated request is rejected globally (JwtAuthGuard)', `status=${noTokenAtAll.status}`);
}
