# DriveShare Platform — Combined Codebase

This archive bundles the two projects worked on in this conversation into one zip, at their current, most up-to-date state:

- **`backend/`** — NestJS + Prisma API (`driveshare-backend`). 14 domain modules (13 original + `company-profile`, added in this conversation), ~180 endpoints.
- **`frontend/`** — React + Vite web app (`driveshare-frontend`). Public Renter browsing (feed, listing detail, user/company profiles), owner tooling (photo manager, company profile manager), and the 15-domain Test Dashboard (`/dev/tests`).

Each project keeps its own `README.md` with full setup instructions, dependencies, and known limitations — read those before running either one. `node_modules/` and `dist/` are excluded from both; run `npm install` in each directory before use.

## What changed in this conversation, briefly
- Backend: added the `CompanyProfile` model/module, a public vehicle-photo-summary endpoint, made the availability calendar public, and expanded listing search parameters — see `backend/README.md`-equivalent context in code comments and `backend/prisma/migrations/20260919120000_add_company_profile/`.
- Frontend: added routing (previously none), the Vehicle Hub feed, listing detail, user profile, company profile, and photo manager pages/hooks, a Vitest + React Testing Library test setup, and the new `15-companyProfile` test-dashboard runner — see `frontend/README.md`.

## Known limitation carried into this archive
Backend schema/migration changes could not be verified against a live database or `npx prisma generate` in the sandbox this was built in (`binaries.prisma.sh` was outside its network allowlist). Run `npm run prisma:generate` (or equivalent) and the full smoke-test suite (`backend/scripts/smoke-test.ps1` or the frontend Test Dashboard) before relying on this in a real environment.
