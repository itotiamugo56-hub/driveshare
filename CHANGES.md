# DriveShare upgrade: what changed and how to apply it

## Apply
Backend (from `backend/`):
1. `npx prisma migrate deploy` (adds the `RefreshToken` table, migration `20261003120000_add_refresh_tokens`), then `npx prisma generate`.
2. Optional `.env` keys: `JWT_ACCESS_TTL=15m`, `JWT_REFRESH_TTL=30d`. `ENFORCE_HOST_VETTING=false` switches the publish gate off for local experiments only.
3. Use a staff user (role `admin` or `support_agent`) to approve ownership documents: `PUT /api/v1/admin/vehicles/:vehicleId/ownership-review` with `{"decision":"verified"}`.

Frontend (from `frontend/`): `npm install && npm run dev`. No new dependencies.

## Backend
- Sessions: login and register now also return `refreshToken` and `expiresIn`. New `POST /auth/refresh` (rotating; reuse of an old token revokes that whole login), `POST /auth/logout`, `POST /auth/logout-all`, `GET /auth/me`. Only a SHA-256 hash of each refresh token is stored.
- Host vetting gate: setting a listing `active` now needs verified identity, a valid unexpired licence, and an approved ownership document for that car (403 with `HOST_VETTING_REQUIRED`). Before this, any owner could publish with no checks.
- `GET /hosting/status`: one call for owns-cars, vetting steps and next step.
- `PUT /admin/vehicles/:id/ownership-review`: staff approve or reject. Nothing could set "verified" before except the seed script.
- Tests: 80 passing (new: sessions, vetting gate, hosting status, ownership review). Smoke runner 04 now covers the gate.

## Frontend
- Toggle removed. Capabilities come from the server. Owners get a contextual "Hosting" pill (count of booking requests, "!" when vetting needs action); everyone else finds "Earn with your car" in the account menu, footer and onboarding. Public `/host` page with earnings calculator and the vetting steps.
- Account avatar with a verification ring and menu.
- Verification centre (`/verify`) now includes the host half: per-car ownership document upload with states (needed, in review, approved, rejected).
- Publishing: the wizard shows a vetting check and keeps the listing as a draft until approved.
- Onboarding (`/welcome`): splash, four value screens, one intent question, location prompt at the end, then "Explore cars" as the primary action. Nothing requires an account.
- Persistent session: stored on the device, renewed automatically (single request, cross-tab lock), opens straight into the app, reopens the host area if that was last used. Voluntary sign-out clears the session, caches and drafts and replays welcome. A session the server ended sends you to sign-in with a note and your page remembered.
- Protected routes use loaders with `?next=`. `/dev/tests` exists only in dev builds. Sign-in only follows same-site `next` paths.
- Brand: D+S road monogram (light, dark, app icon, favicon, manifest, social image), topo texture, illustrations.
- Tests: 162 passing. `VehicleCard.test.tsx` was already failing before my changes (it contains no tests) and is untouched.
