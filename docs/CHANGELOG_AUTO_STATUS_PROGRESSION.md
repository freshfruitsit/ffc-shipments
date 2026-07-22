# Automatic Status Progression — Change Status & Complete Shipment Removed

The biggest single change in this project. `overall_status` is no longer
a field a person sets — it's now fully derived, automatically, from the
6 module statuses (Documents, Customs, Municipality, Delivery Order,
MOFAIC, Physical Documents). "Change Status" and "Complete Shipment" are
gone entirely. The stepper just reflects reality; there's nothing left
to manually trigger.

## The new 8-stage flow

| Stage | Turns green when... |
|---|---|
| 1. Created | Baseline — every shipment starts here |
| 2. Dubai Customs | Customs status = Finished |
| 3. Delivery Order Received | Delivery Order status = Received from Carrier (or later) |
| 4. Dubai Municipality | Municipality status = Finished |
| 5. Documents at FFC HO | Physical Documents' "Originals Received" = true |
| 6. MOFAIC Completed | MOFAIC status resolved (Completed/Paid/Not Applicable) |
| 7. Physical Documents Dispatched | Physical Docs status = Dispatched or further |
| 8. Completed | *All six* resolved, no blocking exceptions, no pending resubmissions — same safety checks as before, just automatic |

On Hold / Cancelled / Rejected are gone from `overall_status` entirely —
those now go through the existing Exceptions feature instead of being a
stepper position, per direct instruction.

## Three enums genuinely replaced, not extended

- **`customs_status`**: 10 values -> **Pending, Draft, Submitted, Finished**
- **`municipality_status`**: 8 values -> **Not Required, Pending, Draft, Submitted, Finished**
- **`overall_status`**: 13 values -> the 8 stage names above

Existing data was carefully migrated, not discarded — every old value
maps onto a sensible new one (e.g. Customs' old Declaration
Created/Under Review both become Submitted; Approved/Closed both become
Finished). Completed shipments stay Completed throughout.

## Real bugs and gaps found while building this

- **A genuine gap in my own design**: I'd computed "is Transport
  complete / does an invoice exist" in the new trigger but never
  actually used either value — meaning the stated "Created requires
  Basic Info + Transport + Invoices" wasn't being enforced by anything.
  Removed the dead computation; that's correctly a frontend display
  concern (showing sub-progress within one stage), not something the
  derivation engine itself needs to gate on.
- **A real, interesting emergent interaction**: because the earlier
  single-document-upload change means *any one* verified document
  satisfies `document_status`, and a Completed shipment is read-only, a
  shipment can auto-complete (and lock itself) the moment its one
  document is verified *if* everything else already happened to be
  terminal first. Correct behavior given both designs together, not a
  bug — just worth knowing for realistic usage (documents naturally
  settle early, before customs/municipality/etc. catch up).
- **Two more notification triggers depended on values being removed
  entirely** (`fn_notify_status_events` fired on `customs_status =
  'Rejected'` and `overall_status = 'Resubmission Required'` — neither
  can occur anymore). Removed outright rather than adapted, since
  Exceptions already has its own notification path for these.
- **`status_transitions` table and `previous_status_before_reopen`
  column** were both purely in service of the old manual mechanism —
  dropped entirely as genuinely dead weight, not left as harmless clutter.
- **A 2026 CVE in `sharp`** (Next.js's own image-optimization
  dependency, CVE-2026-33327 and related) surfaced during final
  verification — unrelated to this redesign, but this project has
  always required zero vulnerabilities. `npm audit fix --force` wanted
  to downgrade Next.js two major versions to fix it; instead added a
  targeted `sharp` override (0.34.5 -> 0.35.3) that resolves it without
  touching Next.js at all.

## What changed in the frontend

- `ShipmentActionBar`: Change Status and Complete Shipment buttons and
  their panels removed entirely.
- The stepper (`ShipmentStepper`) rebuilt for the 8 new stages — since
  `overall_status` now *is* one of the stage names directly, the
  mapping simplified from an indirect lookup table to a direct index
  match.
- The PWA's shipment detail page and flight-path visual updated to
  match; the two PWA components that existed purely for Change Status
  (`status-detail-client.tsx`, `change-status-sheet.tsx`) deleted
  outright.
- Customs/Municipality update forms (desktop tabs and the wizard's
  step5) updated to the new simplified status options.
- Five separate stale hardcoded status arrays found and fixed across
  the register filter, portal-updates validation schemas, and the
  severity/badge-coloring config — none of these would have been
  caught by TypeScript (plain string arrays), only by actually checking
  each one.

## Verified for real

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx next build` — clean, all routes present.
- `npx vitest run` — 51/51.
- `npm audit --omit=dev` — **0 vulnerabilities** (the sharp CVE above,
  fixed).
- Full clean SQL rebuild from `00_supabase_stub.sql` through every
  migration, clean seed load, **155/155 pgTAP** — including 9 new tests
  proving the derivation engine advances through all 8 stages
  independently and in order, refuses to auto-complete while
  `document_status` is unresolved even with everything else terminal,
  and correctly holds back on a blocking Critical exception even once
  every subprocess is genuinely resolved.
- Every pre-existing test that referenced a removed function
  (`change_shipment_status`, `confirm_shipment_completion`) or a
  removed value was found and either rewritten to test the new
  automatic behavior or removed as testing a mechanism that no longer
  exists — nothing was left silently broken or skipped.

## Known simplifications (by design, not oversight)

- "Created" doesn't track its own Basic Info/Transport/Invoice
  sub-progress in the database — showing that detail (e.g. "2 of 3
  done") is a reasonable next step for the stepper's display layer, but
  isn't wired in yet.
- Municipality and MOFAIC don't have their own visible stepper stage
  (they never did) — they still fully gate stage 8, they just don't
  get their own numbered position in the 8-stage visual.
