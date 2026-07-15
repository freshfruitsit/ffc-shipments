# Create Shipment: Full 8-Step Wizard

Replaces the Module 1 single-step quick-create form with the real wizard
from your screenshots — same 8 steps, same field labels, same layout,
extracted directly from the prototype's `WIZ_STEPS`/`PORTAL_FIELD_CONFIG`/
`wfield`/`wselect` source, not approximated.

## Architecture decision: when does the shipment actually get created?

The prototype is a client-side demo with no real backend — it collects
all 8 steps into memory and only "creates" anything at the very end. This
app has a real database, and **"Save as Draft" appears from step 1
onward** in your own screenshots — which only makes sense if something
real exists to save. So: **Basic Info (step 1) creates the real shipment
immediately** via `create_shipment`, in `Draft` status. Every step after
that is a real update to that same shipment, using the exact same
Server Actions already built and tested for the shipment detail tabs
(`update_shipment_transport`, `add_invoice`, the upload flow,
`update_customs` + `update_municipality`, `update_delivery_order` +
`update_mofaic`, `update_physical_documents`). Step 8 is a live summary
read back from the database, not the wizard's own in-memory state.

This means every "Next" click is a real save, "Save as Draft" always
works because there's always something to save, and "Back" navigates
between already-saved data — nothing is lost if someone closes the tab
partway through.

## Exact matches

- Step count, order, and labels: Basic Info → Transport → Invoices →
  Documents → Customs & Compliance → Delivery Order & MOFAIC → Physical
  Documents → Review & Submit
- Step indicator: numbered circles, checkmark once done, connecting line
  — exact port of `.wizard-steps`/`.wstep` CSS
- **Shipment Mode**: Air enabled, Sea/Land shown but disabled with
  "(Future Phase)" — exact port of the prototype's `disabledOpts`
  mechanism, and matches this schema's real Phase-1-Air-only constraint
- Every field label, per step, matches `PORTAL_FIELD_CONFIG` /
  the `wfield`/`wselect` calls exactly
- Invoices step: multi-row add/remove, running totals-by-currency strip
- Delivery Order status "Received" auto-fills today's date if blank —
  exact port of that business rule
- Review & Submit: same six review blocks (Basic Information, Transport,
  Invoices, Dubai Customs/Municipality, Delivery Order/MOFAIC, Documents)

## One deliberate simplification

The prototype's Documents step supports "groups" — multiple files under
one document type, optionally linked to a specific invoice. This schema
associates exactly one document type per document record, so the wizard's
Documents step reuses the same real upload component from the shipment
detail page (one file + type per upload, repeatable) rather than
building a separate grouping concept the data model doesn't actually
have. Everything about it is real (actual Storage upload, actual
`upload_document_metadata` RPC) — only the "group several files under
one label" UI concept is simplified.

## Two real bugs caught while building this

1. **`CreateShipmentSchema` originally required `priority` and had no
   `mode`/`responsible` fields at all** — leftover from the old
   single-step quick-create form. The wizard's Basic Info step doesn't
   collect Priority (matching the prototype exactly — the RPC defaults it
   to Medium), but does collect a Responsible User via a real dropdown
   instead of always defaulting to the current user. Updated the schema
   and the 21 existing Vitest tests that depended on the old shape —
   caught immediately by the test suite failing, not discovered later.
2. **A test fixture UUID with an invalid variant nibble** — same class of
   bug as the SQL round: Zod 4 validates real RFC 4122 UUID structure, not
   just the 8-4-4-4-12 shape. Caught by the failing test, not missed.

## Verified

`npx tsc --noEmit`, `npm run build` (30 routes), `npm run lint`, `npm run
test` (27/27 Vitest, up from 24), `npm audit --omit=dev` (0
vulnerabilities) — all clean. Full local Postgres rebuild + 74/74 pgTAP —
no regressions (no SQL changed this round).

## Still outstanding from before this pass — please don't lose this

You never answered the diagnostic questions from the branch/category
dropdown issue (the `pg_policies` and `information_schema.table_privileges`
checks). **The wizard's Basic Info step uses the exact same cached
`getActiveBranches()`/`getShipmentCategories()` functions the tab-based
New Shipment form used** — if that underlying database grant issue was
never actually fixed on your live project, the wizard's Branch and
Category dropdowns will be empty for the same reason, not a new bug.
Please run those two checks before testing this — it'll save a
round-trip.
