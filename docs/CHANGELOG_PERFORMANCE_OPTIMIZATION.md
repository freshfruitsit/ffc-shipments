# Performance Optimization Pass

## Read this first: scope and honesty about what's verifiable from here

Your spec asked for 25 sections including Playwright performance tests,
before/after screenshots, and real Vercel-Mumbai-to-Supabase-Mumbai
timing measurements. I don't have a live deployment, a browser, or
network access to your actual infrastructure from this environment —
and Playwright specifically is blocked in this sandbox (`cdn.playwright.dev`
isn't reachable here). Claiming to have done those would mean fabricating
numbers. Instead, this pass focuses on what's genuinely fixable and
independently verifiable: the actual query waterfalls in the code,
tested against a real local Postgres rebuild with pgTAP, real `EXPLAIN
ANALYZE` output, and real build/lint/test output. Where something needs
your live environment or Vercel dashboard, I've said so explicitly rather
than guessing.

## What was actually wrong (measured, not assumed)

Before touching anything, I read the actual code paths:

| Page | Before (real count from the code) |
|---|---|
| Every page load (root layout) | 1 `getUser()` + up to 4 **sequential** queries (profile → branch → notification count) — not even parallelized |
| Dashboard | 4 separate `count(*)` queries (parallel, but still 4 round trips) |
| Shipment detail (any tab) | 1 shipment fetch + up to 9 more queries: port name, responsible name, invoice totals, **the full assignable-profiles list on every load**, status transitions, and 4 separate `has_permission` calls |
| New Shipment wizard | Already consolidated via `Promise.all` in the prior round — 13 parallel requests, not sequential, but still worth noting as the baseline |

## What's fixed, real, and tested

### 1. `vercel.json` — Mumbai region
Added `{"regions": ["bom1"]}`. No conflicting route-level runtime/region
exports found anywhere in the app.
**You still need to do this manually too**: Vercel Dashboard → your
project → Settings → Functions → Function Region → set to Mumbai. The
`vercel.json` file and the dashboard setting are two different
mechanisms; both should point the same way.

### 2. `get_app_shell_context()` — one RPC replaces the layout's sequential queries
Returns profile, branch name, permissions, unread notification count, and
`can_view_all_branches` in one call. Returns `{ok:false, reason:...}`
for the no-profile/inactive cases instead of raising, so `layout.tsx`'s
existing exact redirect behavior (no-profile / inactive / db-error →
different `/access-denied` reasons) is preserved precisely, not
approximated.
Wrapped in React's `cache()` (`lib/data/app-shell-context.ts`) so if a
page also needs this data within the same request, it's not fetched
twice — this is request-scoped de-duplication only, never a cross-user
cache.

### 3. `get_dashboard_metrics(p_branch_id)` — one RPC, filtered aggregates
Same 4 visible KPIs as before (I did not add new cards — that would be
a feature change, not a performance fix), now from one query using
`count(*) filter (where ...)`. The RPC itself returns more fields
(documents/customs/delivery-order/MOFAIC/physical-docs pending, arriving
today/this week, open exceptions) for when Module 3 actually adds those
cards to the UI — available now, not wired to the display yet.
Branch filtering respects `view_all_branches` — an unauthorized branch_id
argument is silently ignored in favor of the caller's own branch, not
trusted at face value.

### 4. `get_shipment_header_context(p_shipment_id)` — the biggest single win
Replaces the ~10-query shipment layout with one RPC. Enforces branch
isolation itself (raises if the shipment belongs to a branch the caller
can't see) — proven with a real pgTAP test, not just asserted.
**Deliberately excludes the assignable-profiles list.** That's the one
piece of the old layout that doesn't belong in a page-load RPC — moved
to `AssignPanel` itself, fetched only when someone actually clicks
"Assign." Every shipment page view used to pull that full list whether
or not anyone touched Assign; now it's zero cost until the button is
clicked.

### 5. RLS: `(select auth.uid())` / `(select fn_is_active_profile())`
Applied to the 5 policies on tables that actually get scanned with many
rows per query: `shipments`, `notifications` (select + update),
`user_saved_views`, `audit_log`. This is a documented Postgres/Supabase
pattern — wrapping a stable function call as a scalar subquery lets the
planner hoist it into a single InitPlan instead of re-evaluating it once
per row. Real, captured evidence (not a claim):

```
InitPlan 1 (returns $0)
  ->  Result  (cost=0.00..0.26 rows=1 width=1) (actual time=0.279..0.280 rows=1 loops=1)
InitPlan 2 (returns $1)
  ->  Result  (cost=0.00..0.26 rows=1 width=1) (actual time=0.724..0.724 rows=1 loops=1)
->  Seq Scan on shipments (actual time=1.024..1.026 rows=2 loops=1)
      Filter: ($0 AND ($1 OR (branch_id = $3)) AND (overall_status <> 'Cancelled'::overall_status))
```
`$0`/`$1` are `fn_is_active_profile()`/`has_permission()` computed **once**,
not per row — that's the mechanism working. I did not touch the other
~35 occurrences across tiny reference tables — those wouldn't show a
measurable benefit and touching them only adds risk without reward.

### 6. Indexes
Added the 11 specific composite indexes your spec listed (branch+status+created,
responsible+created, branch+eta, etc.) as `create index if not exists` —
safe to re-run. **The trigram indexes you asked about (ref, AWB, supplier
snapshot, invoice number) already existed** from an earlier round — checked
`pg_indexes` directly rather than assuming.

### 7. `select("*")` narrowed
4 real occurrences found and fixed (invoices tab, comments tab, documents
tab ×2) — now selecting only the columns each page actually renders.

### 8. Loading states that don't blank the header
`app/(app)/shipments/[id]/loading.tsx` — because of how Next.js scopes
nested `loading.tsx` files, this one applies to `{children}` inside the
shipment layout, not the layout itself. Switching tabs now shows a
skeleton only in the tab content area; the header, stepper, and tab bar
stay mounted and visible. Added matching skeletons for the register and
the wizard, sized to their actual layouts to avoid content jumping when
real data arrives.

### 9. Supabase browser client — explicit singleton
`lib/supabase/client.ts` now caches the client at module scope. Every
component that calls `createClient()` (NotificationBell, AssignPanel,
DocumentCard, etc.) shares one instance instead of each potentially
creating its own.

### 10. Cache invalidation — fixed for correctness, not just narrowed
Your spec asked to narrow `revalidatePath` calls. I found the opposite
problem was more urgent: several mutations (transport, invoices, assign,
status change, and all 5 sub-process tabs) only revalidated the shipment
route itself, not the shared layout — meaning the header's "Last
Updated," status, invoice total, or responsible-user display could show
**stale data** after a save, since Next.js's `revalidatePath` without the
`"layout"` type only invalidates that exact path. Fixed all of these to
use `revalidatePath(path, "layout")` so the header refreshes alongside
whichever tab was actually edited. Comments correctly stays narrow — it
doesn't touch `shipments.updated_at` at all, confirmed by reading the
`add_comment` RPC itself rather than assuming.

## What I did NOT do, and why

- **`getClaims()` instead of `getUser()`**: this requires Supabase's
  asymmetric JWT signing keys to be enabled on your project (Project
  Settings → API → JWT Keys). I have no way to confirm whether that's
  configured on your actual project, and switching the auth verification
  mechanism without knowing is the single highest-risk change on this
  entire list — getting it wrong breaks login for everyone. I left
  `getUser()` in place and focused the auth optimization on eliminating
  *redundant* calls instead (via the `cache()`-wrapped shell context).
  If you confirm JWT signing keys are enabled, this is a safe follow-up.
- **12 separate per-tab RPCs**: your own spec says "do not create
  unnecessary RPCs when one optimized joined query is sufficient" — and
  the tabs already do 1–3 *parallel* queries each (via `Promise.all`),
  not sequential waterfalls. That's a fundamentally different problem
  than what dedicated RPCs solve. Building and securing 12 new RPCs for
  a marginal gain over already-parallel queries wasn't the right
  risk/reward trade here.
- **Real production timing / Vercel↔Supabase latency numbers**: not
  measurable from this sandbox. Once deployed with the Mumbai region set,
  check Vercel's own function duration logs for real numbers.
- **Playwright performance tests**: blocked in this sandbox. The test
  file structure from Module 1/2 is still there if you want to run these
  yourself locally or in CI.
- **Bundle analyzer breakdown / true before-after bundle diff**: I don't
  have a historical "before" snapshot to diff against (this sandbox
  doesn't retain git history across rounds). Current measured shared
  chunk size: **1.1MB** (`.next/static/chunks`). To get a real before/after,
  run `npm run build` on your previous commit and this one and compare —
  I can't fabricate the "before" number honestly.
- **Screenshots**: no live UI to screenshot from this environment.

## Verified

`npx tsc --noEmit`, `npm run build` (30 routes), `npm run lint`, `npm run
test` (27/27 Vitest), `npm audit --omit=dev` (0 vulnerabilities) — clean.
Full local Postgres rebuild (all 5 migrations) + 83/83 pgTAP (up from 74
— added 9 new tests including a security-critical branch-isolation check
on the new header-context RPC). Started the actual production server and
hit `/login`, `/dashboard`, `/shipments`, `/shipments/new`, and a
shipment detail route — clean 200/307 responses, no errors in the server
log.

## Deploy

New migration this round: `20260101000005_performance_optimization.sql`
— run it in Supabase's SQL Editor after the existing ones. Safe to re-run
(every statement uses `if not exists`/`drop ... if exists` guards).

Same app-code deployment as before — copy into your repo folder, commit,
push. Then set the Vercel Function Region to Mumbai in the dashboard as
noted above.

## Verdict

**PASS with documented exceptions** — the query-waterfall and RLS/index
work is complete, tested, and safe to deploy. The items explicitly listed
above (getClaims, per-tab RPCs, live timing data, Playwright, bundle
diff, screenshots) are either deferred with a stated reason or need your
live environment to complete — not silently skipped.
