# What changed in this drop

## Run these first
    cd backend  && npx prisma migrate deploy && npx prisma generate && npm run test:unit   # 62 unit tests
    cd frontend && npm ci && npx tsc -b && npx vitest run                                    # 142 tests

## Backend
- NEW trips module (POST /trips/preview, POST /trips, GET /trips/mine, GET /trips/:id, POST /trips/:id/cancel, POST /trips/:id/respond)
  and Trip model + migration 20260929120000_add_trip. Renters can now book; payments/deposits/cover run in-process with rollback.
- NEW GET /vehicles/mine and GET /listings/mine (owner dashboard).
- FIX insurance premium maths extracted to estimateDailyPremiumCents (preview price == bound price).
- FIX duplicate VIN is a 409 with a plain message, not a 500.
- SECURITY trust score readable only by self/staff; eligibility-check only by self, staff, or the listing's host;
  setting a listing's trust threshold only by its owner/staff (was open to any signed-in user).
- SECURITY calendar: owners can no longer reopen a renter-booked day or mark days booked; dates validated and
  normalised to UTC midnight (matches how trips store days).
- Hosts see a renter's trust tier only on that renter's own trips.
- Tests: jest.config.js (unit tests, no database needed) and 4 spec files.

## Frontend
- New design system (index.css), shared header, error boundary, offline banner, page titles, dark mode, touch targets.
- Renter: hub with near-me, cards with save heart, listing detail (availability, condition, host, cover), saved cars, compare,
  recently viewed, sign in, get verified, checkout, my trips, trip detail with cancel.
- Owner: /owner dashboard (requests accept/decline, cars, drafts), /owner/new five-step wizard with preview,
  /owner/cars/:id calendar + price and rules + pause.
- Fixes: API error shape ({statusCode}) now read correctly; identityApi.submitLicense body matched the backend DTO.

## Known gaps
- Migration and booking flow never run against a real database (Prisma engine download was blocked where this was built).
- VIN lookup is a mock (always a Toyota Camry). Payouts/earnings statements not built (payout endpoints are service-only).
- Owner-side trip endpoints have no test-dashboard runner yet. 15% fee is mirrored in frontend/src/lib/owner.ts.
- Hub, listing detail and verify pages have no automated tests.
