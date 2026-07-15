# Prototype Parity Pass

Rebuilt against the actual finalized prototype source (`ffc2/head.html`,
`body.html`, `app.js`), not screenshots or approximation — exact colors,
exact CSS classes, exact stage/tab/view lists extracted directly from the
prototype's own code.

## Exact matches

- **Colors**: `--primary: #08783E`, all other tokens (border, text,
  warning, error, info, etc.) copied byte-for-byte from `head.html`.
- **Sidebar**: full 15-item nav (Dashboard, Shipments, Create Shipment,
  Documents, Customs & Compliance, Delivery Orders, MOFAIC Follow-up,
  Physical Documents, Exceptions, Reports, Historical Data Import, Master
  Data, Audit Log, Discovery & Sign-off, Administration) — same order,
  same labels.
- **Topbar**: app title + tagline, global search bar, real notification
  bell (backed by the actual `notifications` table, not a static badge).
- **Register page**: exact header copy ("Centralized register — replaces
  the manual Excel worksheet"), all 13 saved-view quick filters as real
  server-side predicates (not client-side post-filtering) in a rewritten
  `search_shipments` RPC, the full column set, Export CSV.
- **Status pill colors**: exact port of `overallStatusPill()`/
  `genericStatusPill()` — same four-tier severity system, same per-column
  critical/warn lists for document/customs/municipality/delivery-order/
  MOFAIC/physical-doc statuses.
- **Shipment detail**: action button bar (Assign, Change Status, Add
  Comment, Upload Document, Raise Exception, Edit), the 8-stage progress
  stepper (exact `.stimeline`/`.stage`/`.sdot` CSS and stage-index logic),
  the key-facts grid, and all 12 tabs in the prototype's exact order
  (Overview, Invoices, Transport, Documents, Dubai Customs, Dubai
  Municipality, Delivery Order, MOFAIC, Physical Documents, Exceptions,
  Comments, Activity History).
- **Date/money formatting**: DD-MM-YYYY, DD-MM-YYYY HH:mm, "{CUR} 
  {value, 2dp}" — exact port of `fmtDate`/`fmtDateTime`/`fmtMoney`.

## New tabs built from scratch (didn't exist before this pass)

- **Exceptions**: real raise/resolve/close lifecycle using the
  `raise_exception`/`resolve_exception`/`close_exception` RPCs that were
  already in the schema but never wired into any UI until now.
- **Activity History**: real audit trail read from the `audit_log` table
  (already existed, RLS-scoped by branch), not a placeholder.

## Two real RPC changes this required

- `search_shipments` gained a `p_view` parameter implementing all 13
  saved-view predicates server-side (exact port of the prototype's
  `SAVED_VIEWS` object), plus `document_status`/`physical_doc_status`/
  `origin_country`/`port` in its return set for the fuller column list.
  The old 4-parameter signature is explicitly dropped (Postgres treats a
  changed parameter list as a new overload, not a replacement — this was
  caught and fixed, not left as a leftover unused function).
- Search now also matches invoice numbers (the search bar's placeholder
  always said "…invoice…" — it just didn't actually search them before).

## What's honestly still different from the prototype

- **Sidebar sections beyond Dashboard/Shipments/Create Shipment** link to
  real routes with a clear "not yet built" message, rather than fully
  working cross-shipment views — these are genuinely Module 3/4 features
  (a global Documents view across all shipments, a global Exceptions
  queue, Reports, Master Data admin, etc.), not a re-skin of something
  that already exists.
- **No "Demo as Role" switcher, no "Reset Demo Data," no "PROTOTYPE"
  flag** — these were prototype-only mechanisms for demoing without real
  auth. The real app uses actual Supabase sessions and real roles from
  each user's profile instead, which is the whole point of moving past a
  prototype.
- **Column customization ("Columns" button) and bulk multi-select
  actions** on the register are not built — the column set is fixed
  (matching the prototype's default view), and the checkbox column isn't
  wired to any bulk action yet.
- Invoices tab doesn't have the stat-strip (invoice count / total by
  currency / illustrative AED total) the prototype shows — the list and
  add-invoice flow are real, just without that summary strip yet.

## Verified

- `npx tsc --noEmit`, `npm run build` (30 routes, up from 17), `npm run
  lint`, `npm run test` (24/24 Vitest) — all clean
- Full local Postgres rebuild with all 4 migrations — clean
- 74/74 pgTAP assertions (up from 71 — added 3 for the new saved-view
  logic)
- Real functional smoke test: raised an exception, resolved it, closed
  it, and confirmed the audit trail actually captured 9 real rows of
  activity for that shipment — the Activity History tab is reading real
  data, not a stub
