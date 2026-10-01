# DriveShare Backend

A complete, runnable implementation of the DriveShare P2P car rental platform's backend,
covering all 12 service domains from the **Backend Architecture Specification**:

1. Identity & Verification
2. Trust Score
3. Vehicle & Listing
4. Access & IoT
5. Data Security & Compliance
6. Payments & Escrow
7. Fraud Detection
8. Insurance & Liability
9. Dispute Resolution
10. Pricing Engine
11. Logistics & Fleet
12. Reviews & Reputation

## Stack

TypeScript + NestJS (modular monolith, one module per domain) + PostgreSQL + Prisma +
Redis (referenced for caching/rate-limiting, not required to boot the API in dev) +
an in-process event bus (`EventBusService`, backed by `@nestjs/event-emitter`) that
stands in for Kafka locally — see the comment in
`src/common/event-bus/event-bus.service.ts` for how to swap it for a real Kafka
producer/consumer without touching any calling code.

## Project layout

```
prisma/schema.prisma          # All ~30 data models across the 12 domains
prisma/seed.ts                # Seeds an owner, renter, admin user + insurance tiers
src/
  main.ts                     # Bootstrap, global prefix /api/v1, Swagger at /api/docs
  app.module.ts                # Wires all 12 domain modules + cross-cutting infra
  common/
    prisma/                    # PrismaService (DB client)
    event-bus/                 # EventBusService (evt.* topic pub/sub)
    auth/                      # JWT strategy/guard + register/login (auth is [INFERRED]
                                #   infrastructure required to make every other
                                #   service's bearer-JWT requirement callable)
    guards/, decorators/        # RolesGuard, @Roles(), @CurrentUser()
    mock-providers/             # One adapter per third-party vendor named in the spec
                                #   (ID verification, DMV, driving history, payment
                                #   processor, insurance carrier, telematics/IoT, CV
                                #   damage model, VIN decode, event-data feed, KMS).
                                #   All default to MOCK mode — see .env.example.
  modules/
    identity/  trust/  vehicle-listing/  access-iot/  security-compliance/
    payments-escrow/  fraud/  insurance/  dispute/  pricing/  logistics/  reviews/
      *.module.ts  *.controller.ts  *.service.ts  dto/*.ts
  scheduled-jobs/               # Cron sweeps referenced across the spec (license
                                #   re-verification, retention purge, dispute SLA
                                #   escalation, review reveal-window + badge re-eval)
```

Every endpoint, data model, and auth rule listed in the architecture spec is
implemented — nothing is stubbed with a `TODO`. Places where the implementation
simplifies a production concern (e.g., geospatial search ranking, a trained ML
risk/pricing model, a real KMS/HSM) are called out with inline comments rather
than silently omitted, and third-party vendor calls are clearly logged as
`MOCKED` at runtime so it's obvious what's a placeholder versus real logic.

## Running it

```bash
cp .env.example .env
# start local Postgres + Redis, e.g.:
docker run -d --name driveshare-pg -e POSTGRES_USER=driveshare -e POSTGRES_PASSWORD=driveshare -e POSTGRES_DB=driveshare -p 5432:5432 postgres:16
docker run -d --name driveshare-redis -p 6379:6379 redis:7

npm install
npm run prisma:generate
npm run prisma:migrate     # creates all tables from prisma/schema.prisma
npm run seed                # creates owner@driveshare.dev / renter@driveshare.dev / admin@driveshare.dev (password: Password123!)
npm run start:dev
```

API is served at `http://localhost:3000/api/v1`, interactive Swagger docs at
`http://localhost:3000/api/docs`.

## Auth model

- `POST /api/v1/auth/register` and `/auth/login` issue a bearer JWT (`role: user` by default).
- Every other endpoint requires `Authorization: Bearer <token>` (enforced globally via `JwtAuthGuard`).
- Endpoints marked `service`-only in the spec (fund movement, key issuance, fraud evaluation,
  automated dispute resolution, etc.) require a JWT whose `role` claim is `service` — in a
  production deployment these calls originate from trusted internal callers (the trip
  orchestrator, other backend services, or scheduled jobs), not end users. For local testing,
  seed or mint a token with `role: 'service'` via `AuthService`, or call `POST /auth/register`
  with `role` overridden directly in the database for a quick test account.
- `admin` / `support_agent` / `arbitrator` roles are set directly on the `User` row (see
  `prisma/schema.prisma`'s `UserRole` enum) and required for moderation/claims/dispute-mediation
  endpoints per each module's `@Roles(...)` decorators.

## Third-party integrations (mocked by default)

Every vendor integration named in the spec has a `mock`/`live` mode switch via env vars
in `.env.example` (`ID_VERIFICATION_MODE`, `DMV_MODE`, `PAYMENT_PROCESSOR_MODE`, etc.).
In `mock` mode (the default, no credentials required) each provider logs a clear
`MOCKED` warning and returns deterministic fake data so the full request/response flow
is exercisable end-to-end. Flipping a mode to `live` without implementing the vendor
call in that provider file will throw a clear "not configured" error rather than
silently returning fake data — this is intentional, to prevent accidentally shipping
mock responses in a production configuration.

## 13th domain: Admin & Operations (managerial layer)

On top of the original 12 domains, `src/modules/admin-ops/` adds the internal
back-office layer a real company running this platform needs. It reads across
all 12 domains rather than duplicating their data, and owns its own tables for
staff permissions, audit logging, moderation, suspensions, incidents, and config.

**Permission model:** `admin`/`support_agent`/`arbitrator` are coarse roles (same
as before); on top of that, `StaffPermission` grants **individually revocable
capabilities** (`view_financials`, `manage_staff`, `suspend_users`,
`override_trust_score`, `moderate_content`, `manage_config`, `view_audit_log`,
`manage_incidents`, `impersonate_users`, `immobilize_vehicles`, `resolve_disputes`).
Endpoints are gated by both — `@Roles(...)` for the coarse role and
`@RequireCapability(...)` for the specific grant — enforced by `RolesGuard` +
`CapabilityGuard`. The seed script grants the seeded admin every capability so
the endpoints are immediately testable; in practice a company would grant
capabilities individually per staff member.

| Area | Base path | Covers |
|---|---|---|
| Staff & permissions | `/admin/staff` | create staff accounts, grant/revoke capabilities, support-view impersonation (time-bounded, reason-logged, read-only intent) |
| User/vehicle admin | `/admin/users` | consolidated cross-domain profile lookup, suspend/unsuspend user or vehicle, force re-verification, manual Trust Score override, listing threshold override — every action reason-logged |
| Assessments | `/admin/assessments` | user risk, vehicle quality, owner/renter performance scorecards, financial health, regional market, compliance posture, vendor mock/live status |
| Monitoring | `/admin/monitoring` | live fraud/dispute/fleet-access/payments/insurance-claims feeds, system health, trust-tier trends |
| Moderation | `/admin/moderation` | flag/resolve queue for reviews & listings, fraud-case triage queue, dispute mediator workbench |
| Reporting | `/admin/reporting` | revenue, payout reconciliation, per-owner earnings export, insurance-pricing audit trail, GDPR compliance report, audit-log query |
| Configuration | `/admin/config` | generic keyed config store (e.g. Trust Score algorithm weights), feature flags, surge-cap policy |
| Incidents & alerting | `/admin/incidents` | incident tracking (P1–P4), alert rules + firings, evaluated automatically every 5 minutes against live monitoring metrics (see `scheduled-jobs.service.ts`) |

Every write action in this module goes through `AdminAuditService`, which logs
actor, action, target, and a mandatory reason — separate from Section 5's
document-access audit log — so "why was my account suspended / my score
changed" is always answerable.

## Smoke testing

`scripts/smoke-test.ps1` is an exhaustive PowerShell smoke test covering all 13
domains: it registers real accounts, drives real request chains end-to-end
(an identity verification is actually approved before it's used to unlock a
vehicle; a dispute actually needs pre/post condition baselines before an
auto-resolution is asserted), and checks both happy paths and documented
failure paths (wrong role, wrong owner, missing capability, duplicate
submission, business-rule violations like "can't capture more than the
deposit hold" or "can't mediate a dispute already in arbitration").

Nothing fails silently: every assertion prints PASS/FAIL/SKIP immediately
with the actual response body on failure, and the script exits non-zero if
anything failed (safe for CI). Run it with:

```powershell
# prerequisites: npm run start:dev  (in one terminal)  +  npm run seed  (once)
pwsh ./scripts/smoke-test.ps1
# or, to stop at the very first failure instead of running the whole suite:
pwsh ./scripts/smoke-test.ps1 -StopOnFirstFailure
```

Works on PowerShell 7+ (recommended) and Windows PowerShell 5.1.

## Known issues found and fixed during smoke-test development

Building the smoke test surfaced two real backend bugs and one smoke-test-only
bug, all fixed in this codebase (not just noted):

1. **Payments controller** (`payments-escrow.controller.ts`) — `authorize()` was
   passing `paymentMethodId` into the `payerUserId` slot; the DTO never had a
   `payerUserId` field. Fixed by adding the field and correcting the call site.
2. **Fraud engine + Trust Score fraud-penalty factor** (`fraud.service.ts`,
   `trust.service.ts`) — the booking-velocity and repeat-offense counters
   queried `RiskEvaluation` by `subjectId: userId`, but for booking evaluations
   `subjectId` holds the **tripId**, not the userId (correctly, by design, for
   that subject type) — meaning these two rows always returned 0 and those
   signals could never fire, and the Trust Score's fraud-penalty factor could
   never be less than 1.0. Fixed by adding a dedicated `userId` field to
   `RiskEvaluation` and querying by that instead. The smoke test's fraud-case
   scenario (section 8) is a regression test for this exact fix.
3. **Reviews service** — `submitReview()` returned a stale pre-reveal object
   even when the same call triggered the mutual reveal. Fixed to re-fetch
   post-reveal.
4. **Smoke test's own `Assert-IsArray`** — Windows PowerShell 5.1 collapses a
   single-element JSON array into a bare object; the original strict
   `IEnumerable` type check would have spuriously failed on any endpoint that
   happened to return exactly one item. Rewritten to check collection length
   via `@()` wrapping instead, which is safe on both PS 5.1 and PS 7+.

Endpoint coverage: 170 declared endpoints, 257 HTTP calls, 300 assertions,
164/170 endpoints exercised directly as of the initial version; the 6 gaps
identified in review (fraud case GET/decision, dispute auto-resolve-attempt/
escalate as standalone calls, payment authorization void, insurance claim GET)
are now closed with dedicated positive- and negative-path coverage.

## Cross-service orchestration note

The architecture spec calls out ([INFERRED]) that a **Trip Orchestration** state
machine is structurally necessary to sequence booking confirmation across Identity,
Trust, Fraud, Insurance, Payments, and Access & IoT. This reference implementation
exposes each domain's endpoints independently (matching the spec's per-service
structure exactly) and publishes/consumes the full set of `evt.*` topics so an
orchestrator/saga coordinator can be layered on top; it is not itself included as a
13th module, since the spec scoped the build to the 12 named domains.

## Testing

```bash
npm run test
```

(Jest is configured; add `*.spec.ts` files per module following standard NestJS
testing conventions — `PrismaService` and the mock providers are straightforward
to stub via Nest's testing module.)
