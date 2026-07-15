# FFC Shipments Management System

**Modules 1.1 + 2: Foundations, Auth, Register, and Full Shipment Detail**

This is the combined package after Module 1.1's security/correctness pass
and Module 2's build-out of the full shipment detail experience (matching
the original prototype's feature set: transport, invoices, documents, and
the five government-portal workflows). See `docs/CHANGELOG_MODULE_1_1.md`
and `docs/CHANGELOG_MODULE_2.md` for exactly what each module added.

## Honest status up front

**Verified for real:** `npm ci`, TypeScript, ESLint, 21 Vitest unit tests,
`npm run build` (17 routes), `npm audit --omit=dev` (0 vulnerabilities),
71 pgTAP database assertions, and a dedicated functional smoke test
exercising every Module 2 RPC end-to-end against a real seeded shipment.

**Cannot be verified in this environment, by design constraint:**
`supabase db start`/`db reset` (no Docker here), Playwright E2E tests (no
browser binaries here), and real screenshots. All three work on a normal
developer machine or GitHub Actions (which has Docker) — see
`.github/workflows/ci.yml`.

**A real gap found and fixed while building Module 2**: the Storage bucket
itself was never created in any migration, only referenced by policies —
every document upload would have failed with "bucket not found" on a real
project. Fixed in `supabase/migrations/20260101000002_security_and_rls.sql`.

## What's in this package

Everything from Module 1.1 (auth, `/access-denied`, branch-aware register,
supplier picker, parameterized search, error/loading boundaries, Asia/Dubai
dates, zero known vulnerabilities), plus Module 2's full tabbed shipment
detail: **Overview, Transport, Invoices, Documents (real Storage upload),
Dubai Customs, Dubai Municipality, Delivery Order, MOFAIC, Physical
Documents, Comments** — each tab wired to its real RPC, respecting the
same permission/branch/Completed-record rules the database already
enforces.

## Prerequisites

A Supabase project with the schema applied, in order:

```
supabase/migrations/20260101000001_initial_schema.sql
supabase/migrations/20260101000002_security_and_rls.sql
supabase/migrations/20260101000003_reference_data.sql   <- production-safe, run everywhere
supabase/seed.sql                                          <- LOCAL/PREVIEW ONLY, never production
```

**If you already applied these migrations to a live project** (e.g. from
Module 1.1), you only need to run the **new** bucket-creation statement —
either re-run all of `20260101000002_security_and_rls.sql` (it's written
to be safe to re-run, using `on conflict do nothing`/`create or replace`
throughout), or just run this one statement directly in the SQL Editor:

```sql
insert into storage.buckets (id, name, public, file_size_limit)
values ('shipment-documents', 'shipment-documents', false, 52428800)
on conflict (id) do nothing;
```

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
  sub-forms yet (fields exist in the schema, just not exposed in these
  forms yet).
- Document verify/archive RPCs exist but aren't wired into the Documents
  tab UI yet.
- Auth is still Supabase email/password, not Entra SSO.

## Next: Module 3

Exceptions, resubmissions, notifications, reports, audit log UI, and
historical import — per the original roadmap.
