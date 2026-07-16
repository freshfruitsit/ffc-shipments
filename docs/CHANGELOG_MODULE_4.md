# Module 4 — Audit Log, Discovery, Historical Import, Master Data, Administration

Builds on Modules 1.1 + 2 + 3. Adds the five remaining `ComingSoon` pages
from the original roadmap: Audit Log, Discovery & Sign-off, Historical Data
Import, Master Data, and Administration.

## What's new

**Two new SQL migrations:**

- `20260101000007_module4_masterdata.sql` — 13 `upsert_*` RPCs, one per
  remaining master-data table, following `upsert_supplier`'s own documented
  template exactly (that function's comment literally flagged this as a
  "Phase 5 task" — this migration is that task). All 13 tables now have a
  real, `administer`-gated write path: `branches`, `countries`, `ports`,
  `airlines`, `freight_agents`, `clearing_agents`, `carriers`,
  `courier_companies`, `shipment_categories`, `document_types`,
  `exception_types`, `currencies` (upsert-by-code, since its PK is the ISO
  code, not a UUID), and `fx_rates` (upsert-by-`(currency_code,
  effective_date)`, since that's the table's actual natural key).
- `20260101000008_module4_import.sql` — the piece the historical-import
  pipeline was actually missing. `fn_validate_import_batch` and
  `fn_commit_import_batch_chunk` already existed (Module 1.1) and are
  fully correct, but **nothing ever wrote to `import_staging_rows`** —
  there's no Supabase Edge Function in this project (no Docker in the
  build environment to create/test one), so parsing happens client-side in
  the browser instead, and this migration adds: `create_import_batch`,
  `stage_import_rows` (bulk JSONB insert, same per-row isolation pattern as
  the existing commit function), `set_import_reconciliation_expected`,
  `get_import_batch_status` (one call returning batch + reconciliation +
  issues, matching the tab-RPC convention from Module 2's performance
  pass), and `list_import_batches`.

**Audit Log and Discovery & Sign-off needed no new SQL** — `audit_log`
already had a real branch/administer-scoped SELECT policy, and
`discovery_items` was already readable by every active profile with
`update_discovery_item()` already gating writes. Both pages read directly
via the Supabase client (same pattern as the existing notification bell),
rather than adding RPCs that would just wrap a `SELECT *`.

**Five new pages:**

- `/audit` — filterable (search, module, date range), paginated, actor
  names resolved in a small second query rather than typing an embedded
  FK-select against the hand-maintained `Database` type.
- `/discovery` — every open decision from the architecture review, with
  inline status/notes editing for users holding `administer`.
- `/import` — file upload → client-side parse (see below) → preview →
  stage → validate → review issues → optional per-month expected-count
  entry → chunked commit with progress → final reconciliation report.
  Past batches listed below the wizard.
- `/master-data` — 14 tabs (one per table), each either the shared
  `NamedMasterDataTab`/`CodedMasterDataTab` component or (for currencies
  and FX rates, whose shapes genuinely differ) a dedicated one.
- `/admin` — Users tab (list, inline role/branch change, deactivate/
  reactivate — all via the RPCs that already existed) and a read-only
  Permission Matrix tab.

## The historical-import parser — grounded in the real file, not guessed

Before writing `lib/import-parser.ts`, the actual uploaded
`Mirsal_2__2025_.xlsx` was inspected directly (via `openpyxl`) to confirm
the real row/column layout rather than assuming a clean single-header-row
shape:

- Row 1: a stray formula-error cell. Row 2: a title row. Row 3: headers
  (several blank/merged — Invoice Value/Currency and Weights/Gross Weight
  are each two columns under one header). Row 4 onward: month-separator
  rows (`"January 2025"`, a single populated cell) alternate with data
  rows (a serial number in column 0, a real supplier name in column 2).
- The parser (`parseMirsalSheetRows`) is a **pure function** — sheet rows
  in, staged rows out — kept independent of the file-reading library
  specifically so it's unit-testable without a browser or a real `.xlsx`
  file. 13 tests in `lib/import-parser.test.ts`, using sample data that
  mirrors the confirmed real structure, not a simplified stand-in.
- Currency **names** (`"Euro"`, `"US Dollar"`) are mapped to ISO codes for
  the set actually seen in the workbook; anything unrecognized is passed
  through uppercased rather than silently defaulted to AED, so it fails
  `fn_validate_import_batch`'s currency FK check visibly instead of
  misstating a real invoice's currency.
- Source status text is preserved as-is into `raw_values.status` —
  `fn_map_source_status_to_overall` (already existed) is what decides the
  resulting `overall_status`, and it does **not** force everything to
  `Completed`, matching the round-3 SQL review's explicit fix.

## A real library-choice problem, and how it was resolved

The obvious choice for client-side `.xlsx` parsing — the `xlsx` package
(SheetJS) — has two unpatched high-severity advisories on the npm
registry (prototype pollution, ReDoS) with **no fix available** there; the
maintainers now distribute patched builds only via their own CDN, which
isn't a reachable package source from this environment. Rather than
either shipping a known-vulnerable dependency or silently reaching for an
unverified alternative, several options were actually checked:
`exceljs` also currently pulls in a vulnerable `uuid` transitive
dependency. `read-excel-file` (9.3.1) does not — `npm audit` reports
**0 vulnerabilities** with it installed — so that's what this module uses.
Confirmed against its actual README rather than assumed from memory.

## Verified for real

`npm ci`, `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (40 tests —
27 existing + 13 new for the import parser), `npx next build` (all new
routes present, zero errors), `npm audit --omit=dev` (**0 vulnerabilities**,
including the new `read-excel-file` dependency), and a full clean-rebuild
pgTAP run against local Postgres 16 + the hand-built `auth`/`storage` stub:
**119/119 assertions pass**, 11 new ones for this module covering
master-data permission gating (an ordinary user is rejected, an admin
succeeds and the row is actually persisted) and the full import pipeline
end-to-end (create batch → duplicate-hash rejection → stage two rows, one
with a deliberately malformed date → validate correctly flags exactly one
invalid row → commit → exactly one shipment actually created).

Also functionally smoke-tested directly against a seeded local database
(not just pgTAP): every one of the 13 new `upsert_*` RPCs, and the full
import pipeline including a genuine reconciliation-mismatch scenario and
the resulting single (not duplicated) audit-log row.

**A real, separate gap found and fixed while building this module**: `lib/
actions/errors.ts` had an allow-list of recognized error-code prefixes,
and anything not on it fell back to a generic "Something went wrong"
message. Auditing every `RAISE EXCEPTION` in the schema for Module 4's own
new codes surfaced that **fifteen pre-existing codes from Module 2** were
never added either (`NOT_ELIGIBLE`, `RESUBMISSION_PENDING`,
`ROOT_CAUSE_REQUIRED`, and others) — meaning several existing, already
-correct, already human-readable server error messages were being silently
replaced by the generic fallback in the UI. Fixed in the same pass as
adding this module's own new codes.

## Cannot be verified in this environment, by design constraint (unchanged from Modules 2/3)

`supabase db start`/`db reset` (no Docker here), Playwright E2E (no
browser binaries here), real screenshots, and an actual test run of the
import wizard against the real ~5,000-row Mirsal workbook end-to-end in a
live browser (the parser logic itself is unit-tested against realistic
sample data; a full real-file dry run is a good first manual QA step on a
real machine before using this for the actual production import).

## Known simplifications (by design, not oversight)

- **Creating brand-new user accounts isn't in Administration yet** — that
  needs Supabase's Admin API with a service-role key, a distinct security
  surface (a service-role key must never reach the browser) from
  everything else on this page, which all works through the signed-in
  user's own session. For now: create the account in the Supabase
  dashboard (Authentication → Users), then manage role/branch here. A
  dedicated Route Handler using the service-role key is a reasonable,
  scoped follow-up if this becomes a real workflow bottleneck.
- The Permission Matrix is read-only by design — it's a business-rule
  table edited via migration + redeploy, the same way every other business
  rule in this schema changes, not a live-editable admin surface.
- Master Data's inline "Add" forms don't yet validate uniqueness
  client-side before submit — the RPCs' own unique constraints catch it
  and the error surfaces via `friendlyRpcError`, just not pre-emptively.
- The import wizard's reconciliation counts are entered manually per
  month; there's no auto-suggestion from the file itself (a legitimate
  small enhancement, not a correctness gap — the reconciliation check
  itself doesn't depend on where the expected number came from).

## Migrations to apply

```
supabase/migrations/20260101000007_module4_masterdata.sql
supabase/migrations/20260101000008_module4_import.sql
```

Purely additive (new functions only) — safe to run on top of everything
already applied from Modules 1.1/2/3.

## This was the last module on the original roadmap

Modules 1.1 through 4 now cover the full feature set from the original
architecture plan. Natural next steps, if wanted, are the deferred items
noted above (new-user invitation via a service-role Route Handler) and
whatever real usage surfaces once FFC starts using this day to day.
