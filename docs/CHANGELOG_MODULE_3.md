# Module 3 — Cross-Shipment Workspaces & Reports

Builds on Module 1.1 + 2. Adds the seven cross-shipment surfaces that were
`ComingSoon` placeholders: Customs & Compliance, Delivery Orders, Documents,
MOFAIC Follow-up, Physical Documents, Exceptions, and Reports.

## What's new

**One new SQL migration** — `supabase/migrations/20260101000006_module3_workspaces_reports.sql`:

- `search_exceptions(p_status, p_severity, p_page, p_page_size)` — the
  cross-shipment Exceptions workspace. Same branch-scoping pattern as
  `search_shipments` (own branch unless `view_all_branches`). Defaults to
  Open/Under-Review/Waiting-for-* statuses unless a specific status is
  requested, so Resolved/Closed exceptions don't clutter the default view
  but are still reachable.
- `get_report_shipments(p_report_key, p_page, p_page_size)` — one RPC
  covering all eight shipment-shaped reports (see below), keyed by a
  validated allow-list rather than eight near-identical functions.
- `get_report_supplier_performance(p_page, p_page_size)` — the one report
  with a genuinely different shape (aggregated by supplier).

**Five workspace pages reuse the existing `search_shipments` RPC** with a
fixed `p_view` — no new SQL needed for these, since the view filters
(`custpending`, `dopending`, `missingdocs`, `physpending`) already existed
from Module 1.1's saved views:

- `/customs`, `/delivery-orders`, `/documents`, `/physical-documents` — a
  new shared `WorkspaceTable` component (one focus status column instead
  of the full 14-column register).
- `/mofaic` — built against `get_report_shipments('mofaic_pending', …)`
  instead, since this workspace's whole point is the aging/due-date
  calculation that RPC already computes (same formula as the per-shipment
  MOFAIC tab: `delivery_order_received_date + mofaic_rules.payment_window_days`).

**Two new workspace-style pages with their own data shape:**

- `/exceptions` — full cross-shipment exception list, severity/status
  filterable, links back to each shipment's own Exceptions tab.
- `/reports` — a card-grid launcher, plus `/reports/[key]` (the eight
  shipment reports) and `/reports/supplier-performance` (the aggregated
  one). Exception Report links directly to `/exceptions` rather than
  duplicating it as a second surface over the same data.

**CSV export** on every new workspace/report page, following the existing
register's export pattern — `lib/actions/reports.ts` plus three small
client components in `components/shipments/report-export-buttons.tsx`
(kept as separate components importing their server actions directly,
rather than one generic component accepting a function prop, to stay
inside the documented `.bind()`-in-the-client-component pattern rather
than relying on an unconfirmed cross-boundary function-prop pattern).

## Report scope — what was and wasn't built, and why

The prototype's `REPORTS` array lists twelve names, but its
`previewReport()` function only gave **eight** of them real, distinct
filter logic — the rest fell through to a generic, undifferentiated
Ref/Supplier/Origin/Status/ETA/Invoice preview. This module ports the
eight that had real prototype behavior:

Daily Arrival, Pending Shipment, Delayed Shipment, Missing Document,
Customs Clearance, Municipality (ZDLM) Pending, MOFAIC Pending, Net and
Gross Weight — plus Exception Report (via the Exceptions workspace) and
Supplier Performance Report (a real aggregation, genuinely useful and
straightforward to build from existing data).

**Deliberately not built, stated plainly:**

- **Audit Activity Report** — folded into Module 4's Audit Log viewer
  instead of shipping two separate surfaces over the same `audit_log`
  table before either one has a real user asking for both.
- **User Workload Report** — the prototype gave this name no real filter
  logic either, and a genuine workload report needs an assignment/queue
  model that doesn't exist yet. Revisit if FFC asks for it specifically.
- **Time Report** — appears in the prototype's `REPORTS` array but
  `previewReport()` never gave it distinct behavior — there's no real
  prototype behavior to port, so inventing one here would be a guess
  dressed up as parity.

## Verified for real

`npm ci`, `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (27 tests),
`npx next build` (32 routes), `npm audit --omit=dev` (0 vulnerabilities),
and a full clean-rebuild pgTAP run against local Postgres 16 + the hand-
built `auth`/`storage` stub: **108/108 assertions pass**, including 11 new
ones for this module (branch-scoping on `search_exceptions` and
`get_report_shipments`, severity/status filtering, invalid-key rejection
for both new parameterized RPCs, and a sanity check on the supplier-
performance aggregation).

Functionally smoke-tested all eight `get_report_shipments` report keys,
`get_report_supplier_performance`, and `search_exceptions` (default/severity-
filtered/invalid-value) directly against a seeded local database — not
just "it compiles."

## Cannot be verified in this environment, by design constraint (unchanged from Module 2)

`supabase db start`/`db reset` (no Docker here), Playwright E2E (no browser
binaries here), real screenshots. All three work on a normal developer
machine or the GitHub Actions CI (which has Docker).

## Known simplifications (by design, not oversight)

- The Exceptions workspace links back to each shipment's own Exceptions
  tab for raising/resolving — there's no bulk "resolve from the workspace"
  action. If FFC wants that, it's a small addition once real usage shows
  it's needed.
- Report pagination is page-based like the register, not the prototype's
  "first 25 rows" cap — a deliberate improvement, not a regression, but
  worth noting since the prototype never paginated its report previews.
- CSV exports cap at 2,000 rows (reports/exceptions) — generous for any
  realistic branch-scoped dataset, same reasoning as the register's
  existing 5,000-row cap, just tuned down slightly since these are
  narrower, more targeted datasets.

## Migration to apply

```
supabase/migrations/20260101000006_module3_workspaces_reports.sql
```

Purely additive (new functions only, no changes to existing tables,
policies, or functions) — safe to run on top of everything already applied
from Module 1.1/2.

## Next: Module 4

Audit Log viewer, Discovery & Sign-off, Historical Data Import, Master
Data admin screens, and Administration (user/role management) — per the
original roadmap.
