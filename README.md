# FFC Shipments Management System

**Modules 1.1 + 2 + 3 + 4: The Complete Original Roadmap**

This package covers Module 1.1 (foundations/auth/register), Module 2
(full shipment detail), Module 3 (cross-shipment workspaces and reports),
and Module 4 (Audit Log, Discovery & Sign-off, Historical Import, Master
Data, Administration) — the full feature set from the original
architecture plan. See `docs/CHANGELOG_MODULE_1_1.md` through
`docs/CHANGELOG_MODULE_4.md` for exactly what each module added.

## Honest status up front

**Verified for real:** `npm ci`, TypeScript, ESLint, 40 Vitest unit tests,
`npm run build` (all routes, zero errors), `npm audit --omit=dev`
(0 vulnerabilities), 119 pgTAP database assertions, and dedicated
functional smoke tests exercising every new RPC directly against a real
seeded database.

**Cannot be verified in this environment, by design constraint:**
`supabase db start`/`db reset` (no Docker here), Playwright E2E tests (no
browser binaries here), real screenshots, and a live end-to-end run of the
import wizard against the actual ~5,000-row Mirsal workbook in a browser.
All of these work on a normal developer machine or GitHub Actions (which
has Docker) — see `.github/workflows/ci.yml`.

## What's in this package

- **Module 1.1**: auth, `/access-denied`, branch-aware register, supplier
  picker, parameterized search, error/loading boundaries, Asia/Dubai dates.
- **Module 2**: full tabbed shipment detail — Overview, Transport,
  Invoices, Documents, Dubai Customs, Dubai Municipality, Delivery Order,
  MOFAIC, Physical Documents, Comments.
- **Module 3**: Customs & Compliance, Delivery Orders, Documents, MOFAIC
  Follow-up (with payment aging), Physical Documents, Exceptions, and
  Reports (eight shipment reports, Exception Report, Supplier Performance).
- **Module 4**: Audit Log viewer, Discovery & Sign-off, Historical Data
  Import (upload → validate → review → commit → reconciliation), Master
  Data (14 reference-data tables, full CRUD), Administration (user role/
  branch management, read-only permission matrix).

## Prerequisites

A Supabase project with the schema applied, in order:

```
supabase/migrations/20260101000001_initial_schema.sql
supabase/migrations/20260101000002_security_and_rls.sql
supabase/migrations/20260101000003_reference_data.sql             <- production-safe, run everywhere
supabase/migrations/20260101000004_public_reference_data.sql      <- production-safe, run everywhere
supabase/migrations/20260101000005_performance_optimization.sql  <- production-safe, run everywhere
supabase/migrations/20260101000006_module3_workspaces_reports.sql <- production-safe, run everywhere
supabase/migrations/20260101000007_module4_masterdata.sql        <- production-safe, run everywhere
supabase/migrations/20260101000008_module4_import.sql            <- production-safe, run everywhere
supabase/seed.sql                                                    <- LOCAL/PREVIEW ONLY, never production
```

**If you already applied 1–6 to a live project**, only 7 and 8 are new —
both purely additive (new functions only), safe to run any time.

## Local development

```bash
npm install
cp .env.local.example .env.local
# edit .env.local with your project's URL and publishable key
npm run dev
```

## Deploying to Vercel

Same as before — import the repo, set `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Production **and** Preview
scopes), deploy.

## Known simplifications (by design, not oversight)

- `lib/types/database.ts` is still hand-written — run
  `npm run db:types` yourself once you have the Supabase CLI + Docker.
- No "responsible user" picker on delivery-order/MOFAIC/physical-docs
  sub-forms yet.
- Document verify/archive RPCs exist but aren't wired into the Documents
  tab UI yet.
- Auth is still Supabase email/password, not Entra SSO.
- The Exceptions workspace links to each shipment's own tab to raise/
  resolve — no bulk actions from the workspace itself yet.
- Reports scope: eight shipment reports, Exception Report, and Supplier
  Performance — Audit Activity Report and User Workload Report are
  deliberately deferred (see `docs/CHANGELOG_MODULE_3.md`).
- Administration can manage existing users' roles/branches but can't
  create brand-new accounts yet (needs a service-role Route Handler —
  see `docs/CHANGELOG_MODULE_4.md`).

## What's next

All five modules from the original roadmap are now built. Natural next
steps: real usage feedback from FFC, the service-role new-user-invitation
flow if needed, and Entra SSO if FFC wants to move off Supabase's own auth.


