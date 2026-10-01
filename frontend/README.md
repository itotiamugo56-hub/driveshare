# DriveShare Frontend

**Phase 2 update:** this now includes the "vehicle hub" product screens (feed, listing detail, owner photo management), in addition to the Phase 1 Test-Runner Dashboard, which remains available at `/dev/tests`. This section list reflects the implementation-plan response to the architecture audit; see that audit and the implementation summary for the reasoning behind each change below.

## Product screens (Phase 2)

- `/` — `VehicleHubPage`: the feed. Filter/sort state lives in the URL (`useSearchParams`); server data (search results) is cached via React Query (`useListingSearch`).
- `/listings/:listingId` — `ListingDetailPage`: photos, description, specs, trust tier, availability for one listing — fully browsable while signed out. `getPublicListing` and `getCalendar` are `@Public()`; vehicle photos/specs are served through a new, narrower `@Public()` projection (`GET /vehicles/:vehicleId/public-summary`) added specifically for this. See "Public-browsing resolution" below for why this wasn't done by just removing the guard from `getVehicle`.
- `/owner/vehicles/:vehicleId/photos` — `VehiclePhotoManagerPage`: upload, remove, and reorder a vehicle's photos. First UI consumer of `addVehiclePhoto`/`removeVehiclePhoto`/`reorderVehiclePhotos`.
- `/dev/tests` — `TestDashboardPage`, unchanged in purpose, moved off the root route.

## What's actually here

- `src/api/client.ts` — the shared Axios instance + a non-throwing `testRequest()` used exclusively by the dashboard's runners, so they can assert on 401/403/400/404 as legitimate expected outcomes (exactly like `Invoke-Api` in `smoke-test.ps1`, which never throws).
- `src/api/domains/**` — one module per backend controller (13 domains + Auth + 8 Admin-Ops sub-controllers), covering **every endpoint** enumerated in the architecture doc's Section 1 capability inventory. This is the layer both the dashboard and the Phase 2 product screens call.
- `src/api/schemas/**`, `src/api/queryClient.ts` — zod response schemas and the shared React Query client (Vehicle & Listing domain only — see "Known, intentional deviations" below).
- `src/hooks/useVehicleListing.ts` — React Query hooks wrapping the Vehicle & Listing API for the product screens.
- `src/components/**`, `src/pages/**` — the Phase 2 product screens' components and pages (see "Product screens (Phase 2)" above).
- `src/store/authStore.ts`, `src/store/testRunStore.ts` — Zustand stores for session state and the live test-run log.
- `src/router.tsx` — the route tree (hub, listing detail, owner photo manager, and the preserved test dashboard).
- `src/test-dashboard/` — the dashboard itself:
  - `ctx.ts` — the shared, mutable `TestContext` threaded through every runner (tokens, IDs), the direct analogue of the plain PowerShell variables in `smoke-test.ps1`.
  - `helpers.ts` — `assert`/`assertStatus`/`assertField`/`assertFieldNotNull`/`assertIsArray`/`skip`, mirroring the script's `Assert-*` functions 1:1.
  - `runners/01-auth.ts` through `runners/14-adminOps.ts` — one file per `smoke-test.ps1` section, reproducing its exact call sequence and assertions, including every documented failure path (wrong role, wrong owner, missing capability, duplicate submission, business-rule violation).
  - `orchestrator.ts` — `runFullSuite()` (runs all 14 in order, sharing one context) and `runSingleDomain(key)` (runs one, auto-bootstrapping Auth first if needed).
  - `TestDashboardPage.tsx` — the UI: base URL / admin credential fields (defaulted to the seeded values), one button per domain, a "Run Full Suite" button, a live color-coded PASS/FAIL/SKIP log, and running counters.
- `App.tsx` renders `<RouterProvider router={router} />` (see `router.tsx`); `TestDashboardPage` is reachable at `/dev/tests`, not mounted at the root anymore.

## Public-browsing resolution (backend change)

The original Phase 2 implementation flagged an open gap: `GET /vehicles/:vehicleId` and `GET /listings/:listingId/calendar` were not `@Public()`, so anonymous visitors got a 401 on photos/specs/availability. Per explicit product direction (maximize anonymous "window-shopping" access, like browsing a marketplace before signing up), this was resolved on the **backend** (`driveserver/backend/src/modules/vehicle-listing/`), not just the frontend:

- **`getCalendar`** was made `@Public()` directly. Its payload is only `{ date, status }` — nothing sensitive — so opening the existing endpoint carries no exposure risk.
- **`getVehicle`** was left exactly as it was (still auth-gated) because it returns `ownerId`, `vin`, `licensePlateEnc`, `ownershipDocTokenRef`, `ownershipVerificationStatus`, and `telematicsDeviceId` — none of which should be public. Instead, a **new** endpoint, `GET /vehicles/:vehicleId/public-summary` (`@Public()`), was added that selects only display-safe fields (make/model/year/trim/seats/transmission/fuelType/mileageLimitPerDay/features/photos). `ListingDetailPage` calls this new endpoint, not `getVehicle`.

This means two backend files changed as part of this frontend task: `vehicle-listing.controller.ts` (new route + one `@Public()` addition) and `vehicle-listing.service.ts` (new `getVehiclePublicSummary` method). Both are additive — no existing endpoint's behavior for authenticated callers changed, and `getVehicle`'s guard was not touched.

**Known limitation:** this backend change could not be verified by running the NestJS build or the test suite in this environment — `npx prisma generate` fails here (`403 Forbidden` fetching engine binaries from `binaries.prisma.sh`, which is outside this sandbox's network allowlist), so `@prisma/client`'s generated types are stale/incomplete for reasons unrelated to this change. `tsc --noEmit` was run and confirms the two edited files introduce no errors beyond the pre-existing, unrelated errors caused by the stale Prisma client (missing `AvailabilityCalendar`/`AlertFiring`/etc. exports — present before this change, in files this change did not touch). The new `public-summary` route and the `getCalendar` visibility change should be exercised against a real `npm run prisma:generate && npm run start:dev` before merging.

## Running it for real

This was built and type-checked (`tsc --noEmit`) and production-built (`vite build`) successfully in the sandbox this was authored in. **It was not exercised against a live instance of the backend in that sandbox**, because the sandbox's network egress allowlist doesn't include `binaries.prisma.sh`, so the backend's Prisma query-engine binary couldn't be downloaded even after PostgreSQL itself was installed and reachable locally. Nothing about the frontend code depends on that constraint — it's purely an artifact of the authoring environment.

To run it against the real backend:

```bash
# 1. Backend (in the driveshare-backend directory)
cp .env.example .env   # point DATABASE_URL at a reachable Postgres
npm install
npx prisma generate
npx prisma migrate deploy
npm run seed
npm run start:dev      # listens on :3000, prefix /api/v1

# 2. Frontend (this directory)
npm install
npm run dev            # opens the Test Dashboard at http://localhost:5173
```

Click **Run Full Suite**. It will register fresh owner/renter/delete-me accounts, log in the seeded admin, mint a `service`-role account through the real staff pipeline, and walk every domain exactly as `smoke-test.ps1` does — through this frontend's own `testRequest`/API layer, never by shelling out to PowerShell.

## Known, intentional deviations from the "real app" architecture

- `testRequest()` bypasses the throwing `request()` wrapper, because a test harness needs to assert on non-2xx statuses as pass conditions, not treat them as errors to toast. The Phase 2 product screens use `request()`/React Query instead (see `src/hooks/useVehicleListing.ts`); this dashboard is deliberately the one place that talks to the API a different way, and that's noted inline in `client.ts`.
- Phase 1 (this dashboard) still uses a single static page with inline styles and local component state — nothing about the dashboard itself changed.
- Phase 2 (`VehicleHubPage`, `ListingDetailPage`, `VehiclePhotoManagerPage`) adds `react-router-dom` (routing) and wires the already-declared-but-previously-unused `@tanstack/react-query` (server-state caching) and `zod` (response validation, scoped to the Vehicle & Listing domain — see `src/api/schemas/vehicleListing.schemas.ts`). Tailwind was **not** added: the existing `index.css` custom-property token system (previously declared but never imported by any entry point) is used directly via inline `style` props instead, since introducing a CSS framework was not itself an audited gap.
