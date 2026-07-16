# Dashboard Rebuild — Full Audit Against the Prototype

The real `/dashboard` page was a Module 1.1 placeholder (4 basic cards) that
explicitly said "the full KPI set from the prototype arrives alongside
Module 3" — that promise was never actually kept when Module 3 was built.
This is that fix, ported directly from the prototype's own source
(`ffc2/index_final.html` — `computeKPIs()`, `buildCharts()`,
`buildUpcomingArrivals()`, `buildAttentionRequired()`), not re-designed
from the screenshots alone.

## Item-by-item audit

### KPI cards (12/12)

| # | Card | Logic ported from prototype | Status |
|---|------|------------------------------|--------|
| 1 | Active Shipments | `overall_status <> Cancelled` | ✅ |
| 2 | Arriving Today | `eta::date = today` | ✅ |
| 3 | Arriving This Week | `eta::date between today and today+7` | ✅ |
| 4 | Documents Pending | `document_status not in (Verified, Complete)` | ✅ |
| 5 | Customs Pending | `customs_status not in (Approved, Closed)` and not Draft/Cancelled | ✅ |
| 6 | Delivery Orders Pending | `delivery_order_status in (Pending, Requested)` | ✅ |
| 7 | MOFAIC Follow-up Pending | `mofaic_status in (Pending, Payment Due, Overdue)` | ✅ |
| 8 | Physical Documents Pending | `physical_doc_status in (Originals Pending, Ready for Dispatch)` | ✅ |
| 9 | Open Exceptions | `exceptions.status not in (Resolved, Closed)` | ✅ |
| 10 | Resubmissions | `overall_status = Resubmission Required` | ✅ |
| 11 | Ready for Collection | `overall_status = Ready for Collection` | ✅ |
| 12 | Completed This Month | `overall_status = Completed` and updated this calendar month | ✅ — **improved**: trend is a real month-over-month delta, not the prototype's hardcoded "+1" |

Every card links through to the matching real workspace/register page,
same as the prototype's `view` targets (Customs card → `/customs`, MOFAIC
card → `/mofaic`, etc.), using the pages already built in Module 3.

### Charts (9/9)

| # | Chart | Status |
|---|-------|--------|
| 1 | Monthly Shipment Volume | ✅ — **improved**, see below |
| 2 | Overall Status Distribution | ✅ |
| 3 | Shipments by Origin Country | ✅ |
| 4 | Shipments by Arrival Port | ✅ |
| 5 | Shipments by Supplier | ✅ |
| 6 | Avg. Processing Time (days) | ✅ — **improved**, see below |
| 7 | On-Time vs Delayed | ✅ |
| 8 | Open Exceptions by Type | ✅ |
| 9 | User Workload (Active Shipments) | ✅ |

All nine are hand-rolled SVG (bar / donut / horizontal-bar), a direct
line-by-line port of the prototype's own `svgBarChart` / `svgDonut` /
`svgHBarChart` functions into React components — not a new design, and
deliberately not a new charting-library dependency for something this
simple to render.

### Upcoming Arrivals table — all 9 columns (Ref, Supplier, AWB, Flight,
ETA, Port, Responsible, Doc %, Status), same filter (ETA between
yesterday and +7 days, not Cancelled, soonest first, capped at 8 rows).

### Attention Required — all 11 alert rules ported, same priority sort
(Critical → High → Medium → Low), capped at 12.

## Two deliberate departures from the prototype — both real-data
## improvements over hardcoded demo values, not oversights

1. **Monthly Shipment Volume** was hardcoded in the prototype (fixed
   numbers for Feb–Jun, a fake formula for Jul). This version computes
   real counts from `shipments.shipment_date`, grouped by month, for the
   trailing 6 calendar months — including months with zero shipments,
   which the prototype's fixed array couldn't represent anyway.
2. **Avg. Processing Time** was six entirely hardcoded constants in the
   prototype (2.1, 3.4, 4.1, 1.6, 5.2, 1.2 — no computation behind them at
   all). This version computes real average day-counts between the
   milestone date columns the schema already tracks
   (`customs_submission_date`, `municipality_submission_date`,
   `municipality_completion_date`, `delivery_order_requested/received_date`,
   `mofaic_payment_date`, `dispatch_date`/`delivered_date`), averaged only
   over shipments where both endpoints of that specific stage are
   populated — nulls don't silently drag an average toward zero.

Also: **Doc %** in Upcoming Arrivals uses the real `required_documents`
config table (category + optional origin-country-specific requirements) —
the same logic `fn_recalculate_document_status` already uses — rather than
the prototype's hardcoded 3-document-type check, so the percentage shown
is internally consistent with the shipment's actual `document_status`.

## A real dependency problem checked and avoided

Before writing any chart code, I checked whether a charting library made
sense here — it doesn't. Nine hand-rolled SVG charts covering this exact
visual style already existed as working, tested logic in the prototype;
porting that logic to React components is strictly less code and less
dependency-surface than introducing a charting library for something this
simple, and matches this project's existing performance-conscious
posture (see the Module 2 performance-optimization pass).

## Verified for real

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx vitest run` — 40/40 (no dashboard-specific unit tests were needed;
  the dashboard's logic lives in SQL, which pgTAP covers below).
- `npx next build` — clean, all routes present.
- `npm audit --omit=dev` — 0 vulnerabilities.
- **Full clean-rebuild pgTAP run: 126/126 assertions pass**, 7 new ones
  added specifically for this rebuild:
  - `monthly_volume` is always exactly 6 entries (not just months with
    data — a genuine correctness check, since a naive `GROUP BY` alone
    would silently drop zero-count months).
  - `status_distribution` counts sum to exactly the caller's own branch
    total (branch scoping actually enforced, not just present in the
    WHERE clause by inspection).
  - `attention_required` correctly includes an alert for a shipment
    forced into a real Rejected-customs state.
  - `attention_required` correctly EXCLUDES another branch's shipment
    for a branch-scoped user.
  - A `view_all_branches` user correctly SEES an alert from a different
    branch (the other side of the same isolation check).
  - `attention_required` is actually sorted by priority — verified with
    a window-function pairwise comparison across the whole returned
    list, not just eyeballing the first couple of rows.
- Manually inspected the full `jsonb_pretty()` output of
  `get_dashboard_metrics()` against a seeded database and confirmed every
  field renders with the correct shape and realistic values.

## Migration to apply

```
supabase/migrations/20260101000009_dashboard_rebuild.sql
```

This one **replaces** `get_dashboard_metrics` (`create or replace
function`) — safe to run over the existing Module 1.1 version, no schema
changes, no data migration needed.

## Known simplifications (by design)

- KPI trend arrows for "Arriving Today"/"Arriving This Week"/"Active
  Shipments" reuse the prototype's own illustrative trend text
  ("+4.2% vs last month", "scheduled flights", "next 7 days") rather than
  a computed delta — the prototype itself never computed those three,
  they were static labels, not data. Only "Completed This Month" had a
  real trend computation in the prototype (a hardcoded "+1"), and that's
  the one now backed by a genuine month-over-month comparison.
- "Arriving Today" and "Arriving This Week" KPI cards link to the plain
  Shipment Register (`/shipments`) rather than a dedicated ETA-filtered
  view — there's no ETA-range filter on the register yet. A small,
  scoped addition if this becomes a real workflow need.
