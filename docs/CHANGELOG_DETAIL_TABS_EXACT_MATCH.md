# Detail Tabs: Exact Prototype Match

Rebuilt against your latest screenshots and the prototype source directly
(`PORTAL_FIELD_CONFIG` in `app.js`), field label by field label.

## The core pattern change

Every editable tab (Transport, Dubai Customs, Dubai Municipality, Delivery
Order, MOFAIC, Physical Documents) was an always-visible inline form
before. Now each one matches the prototype exactly: a **read-only display**
of the current values, plus an **"Update X" button that opens a modal**
with the edit form — same modal chrome (520px width, dark overlay,
header/body/footer with Cancel + Save), same field labels, same layout.

Documents changed from a table to the exact `.doc-card` grid — 3-column
cards showing filename, type · version, "Uploaded {date} by {name}",
status, and real **Preview / Replace / Archive** buttons (all three wired
to actual RPCs — Replace re-runs the full signed-upload-URL flow targeting
the existing document's ID via `replace_document`; Archive prompts for a
reason and calls `archive_document`).

Invoices gained the stat-strip (Invoices count / Total by Currency /
Illustrative AED Total), the AED conversion computed from the real
`fx_rates` table's latest rate per currency — not hardcoded.

MOFAIC's "Due Date" is computed from the actual `mofaic_rules.payment_window_days`
config (15 by default, but read from the table, not hardcoded) plus the
shipment's real `delivery_order_received_date` — matching the prototype's
countdown display exactly, including the "(Nd overdue)" / "(Nd left)" format.

## Three real bugs found and fixed while doing this

1. **Delivery Order, MOFAIC, and Physical Documents were silently
   discarding the "Responsible User" field** — the Server Actions
   hardcoded `p_..._responsible: null` regardless of what the form sent,
   because the original modals didn't have that field and I never went
   back to wire it up when the read-only display started showing it.
   Fixed in all three: schema, action, and modal now all handle it.
2. **Delivery Order's modal doesn't have a "Requested Date" field**
   (matching the prototype exactly), but the underlying RPC does a plain
   `set requested_date = p_requested_date` — not a coalesce. Omitting it
   from the form would have silently cleared any existing value on every
   save. Fixed with a hidden field that round-trips the existing value
   unchanged.
3. **A real ESLint catch, not a passthrough**: `npm run lint` correctly
   flagged `setState` called synchronously inside a `useEffect` (closing
   the modal on successful save) across all 6 new modals — a legitimate
   "cascading render" risk. Fixed with the React-recommended alternative
   (adjusting state during render via a previous-value comparison,
   extracted into a shared `useCloseModalOnSuccess` hook) rather than
   suppressing the rule.

## Verified

`npx tsc --noEmit`, `npm run build` (30 routes), `npm run lint`, `npm run
test` (24/24 Vitest), `npm audit --omit=dev` (0 vulnerabilities) — all
clean. Full local Postgres rebuild + 74/74 pgTAP — no regressions.

## Not done in this pass — flagging clearly, not quietly

The **Create Shipment wizard** in your screenshots is a genuine 8-step
flow (Basic Info → Transport → Invoices → Documents → Customs &
Compliance → Delivery Order & MOFAIC → Physical Documents → Review &
Submit) with its own field layout per step. What exists today is still
the Module 1 single-step quick-create form. This is a substantial,
separate build — not a re-skin of something already working — and needs
its own dedicated pass rather than being squeezed in alongside this
round's tab-by-tab rebuild.
