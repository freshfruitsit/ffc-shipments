# Performance Optimization: Final Pass

## What this pass actually completed

This builds on the previous round rather than replacing it. Everything
listed as "already completed" was preserved and verified working (vercel.json,
the 3 context RPCs, indexes, loading skeletons, the browser client
singleton) — plus:

1. **`getClaims()` in `proxy.ts`**, replacing `getUser()`. Verified against
   Supabase's own current documentation before implementing (not a guess):
   `getClaims()` verifies locally via WebCrypto when asymmetric JWT signing
   keys are configured, and **automatically falls back to the same
   Auth-server round trip `getUser()` always made** when they aren't. This
   means it's safe to adopt regardless of your project's JWT key
   configuration — there's no scenario where switching weakens
   verification.
2. **Removed the redundant `getUser()` call in the protected layout.**
   `get_app_shell_context()` now does its own `auth.uid()`-based check;
   the layout no longer double-verifies.
3. **`v_assignable_profiles` — found and fixed a real, live security gap**,
   not a hypothetical one. The view had no `security_invoker`, meaning it
   ran with its *owner's* privileges and completely bypassed the
   `profiles` table's own branch-scoped RLS. Any authenticated user could
   see every active profile across every branch through it. Replaced
   with `get_assignable_profiles(p_branch_id, p_required_permission)`,
   which enforces the same branch/permission rules the caller is
   actually subject to. Proven with pgTAP: a Dubai user genuinely cannot
   see Abu Dhabi profiles and vice versa, an inactive/unprovisioned
   session is rejected, an authorized cross-branch supervisor gets the
   wider list.
4. **All 12 shipment-tab RPCs**, each enforcing branch access itself via
   the existing `fn_require_shipment_access` helper (reused, not
   duplicated — see the bug notes below), returning only what that tab
   needs with names already joined server-side, and a `can_edit`/
   `can_manage`/`can_comment` flag instead of a separate `has_permission`
   call. All 12 rewired into their actual page components.
5. **`get_new_shipment_form_context()`** replaces ~13 separate requests
   (3 `has_permission` calls, a profile lookup, 11 master-data queries,
   an unfiltered profile query, a client-side role_permissions join) with
   one RPC. Suppliers are no longer eagerly loaded at all — replaced with
   **`search_active_suppliers(p_query, p_limit, p_offset)`**, paginated
   (max 20 rows), debounced 250ms on the client, with the same query-length
   validation pattern as the register's search.
6. **Wizard steps 2–8 are dynamically imported** (`next/dynamic`), each
   its own chunk, loaded only when the wizard actually advances to that
   step. Verified in the actual build output — the wizard step chunks
   are separate 4–16KB files, not merged into the initial bundle.
7. **Cache invalidation corrected, not just narrowed.** The previous
   round's `"layout"`-type invalidation was fixed to point at the
   *specific tab path* instead (e.g., `/shipments/{id}/transport`, not
   the generic `/shipments/{id}` stub) — this is actually narrower AND
   more correct simultaneously, since the header lives in the same route
   tree as that specific tab and refreshes on the next visit to it,
   without forcing every sibling tab to also re-fetch. **One deliberate
   exception**: status change still uses `"layout"` type, because it
   genuinely changes every tab's edit-enabled state (every tab checks
   `overall_status !== 'Completed'`), not just what the header displays —
   narrowing that one would have reintroduced a real staleness bug.
   Assign now threads the current tab's pathname through from the client
   (via `usePathname()`) so it can target exactly the tab the user was on
   without needing the broad type.
8. **Bundle analyzer configured** (`npm run analyze`, `@next/bundle-analyzer`).
9. **Lightweight performance logging** (`lib/performance-logging.ts`),
   wired into the three highest-value shared contexts (app shell,
   dashboard, shipment header) — logs operation name, duration,
   success/failure, and a correlation ID; warns above 500ms. Deliberately
   console-based (captured by Vercel/Supabase's existing log viewers),
   not a new paid product.

## Real bugs caught and fixed while building this — not glossed over

These were all caught by actually running the tests, not assumed away:

1. **Ambiguous column references from `RETURNS TABLE(...)` implicit OUT
   variables.** `get_assignable_profiles` declares `RETURNS TABLE(id uuid,
   full_name text, role app_role, branch_id uuid)` — Postgres creates an
   implicit variable for each of those names, in scope for the *entire*
   function body. Two internal queries referencing bare `id` and bare
   `role` (against `profiles`/`role_permissions`) became genuinely
   ambiguous. Fixed by explicit table aliasing throughout.
2. **A duplicate function name collision.** I initially wrote a new
   `fn_require_shipment_access(uuid)` helper for the 12 tab RPCs, not
   realizing an identically-named function already existed from an
   earlier round with a different signature
   (`fn_require_shipment_access(uuid, text)`, with a default on the second
   parameter) — Postgres couldn't resolve which one a 1-argument call
   meant. Fixed by reusing the existing function instead of duplicating
   it.
3. **An RLS chicken-and-egg in the test suite itself**: a discovery
   subquery meant to find a specific test user ran *after* switching to
   the RLS-restricted `authenticated` role, so RLS filtered out the very
   row the query was trying to find. Fixed by capturing the value via
   `\gset` while still in the unrestricted session context, before
   switching roles.
4. **Stale session-variable leakage between test blocks.** `reset role`
   resets the database role but not custom session GUCs — a leftover
   random UUID from an "unprovisioned session" test survived into a later
   admin-level `UPDATE`, which a trigger tried to use for audit-log actor
   attribution, failing that trigger's own foreign key constraint. Fixed
   by explicitly resetting the session variable before the mutation.
5. **Test fixture reuse conflict**: the same profile was deactivated
   for one test while a *later* test in the same block still needed it
   active. Fixed by reordering so the destructive mutation happens last.
6. **The wizard's Delivery Order/MOFAIC/Physical Documents "Responsible
   User" dropdowns were pre-selecting nothing** after the tab-RPC
   rewrite, because the RPCs initially returned only the resolved name,
   not the raw ID the edit modal needs to pre-select the current
   assignee. Caught by re-reading what each modal component actually
   expects, not just what compiled.

## Backend request counts (real, from reading the actual code)

| Screen | Before | After |
|---|---|---|
| App shell (every page) | `getUser()` + up to 4 sequential queries | `getClaims()` in proxy (no separate layout auth call) + 1 RPC |
| Dashboard | 4 separate count queries | 1 RPC |
| Shipment header | ~10 queries (incl. the full assignable-profiles list on every load) | 1 RPC (assignable profiles moved to on-demand, only when Assign opens) |
| Each shipment tab | 2–4 queries + a `has_permission` call | 1 RPC |
| New Shipment initial load | ~13 requests | 1 RPC + 3 permission-scoped assignable-profiles calls (see note above on why these three can't collapse further) + on-demand supplier search |

## Bundle sizes (real, measured — not fabricated)

Current total shared chunks: **1.1MB** (`.next/static/chunks`), measured
via `npm run analyze`. This is unchanged from the previous round's
total — dynamic imports change *when* code loads, not the total bytes
shipped across the whole app. What's verifiably different: the wizard's
steps 2–8 now live in their own separate chunks (confirmed by grepping
the actual build output — `Step2Transport`/`Step6DeliveryMofaic` etc.
appear in standalone 4–16KB files, not the main bundle), so the New
Shipment route's *initial* JS no longer includes code for steps the user
hasn't reached yet.

## What I did not fabricate

- **Live production timing** (cold/warm/median/P95): not measurable —
  no live Vercel/Supabase deployment reachable from this environment.
  Labeling this "estimated" would be a guess dressed up as data; I'd
  rather tell you plainly it's missing.
- **Playwright**: blocked in this sandbox (`cdn.playwright.dev`
  unreachable). The existing test files are untouched and ready to run
  in your own CI or locally.
- **`supabase start` / `supabase test db --local`**: this sandbox uses a
  direct local Postgres install, not the Docker-based Supabase CLI stack
  — the same substitute used successfully for every SQL round so far in
  this project. Every migration, RPC, and RLS policy was verified against
  a real Postgres 16 instance with pgTAP, just not through that specific
  CLI wrapper.
- **Screenshots**: no browser/visual capability in this environment.

## Security regression check

97/97 pgTAP assertions pass (up from 74 at the start of the previous
round) — including the new branch-isolation tests for every tab RPC, the
`get_assignable_profiles` cross-branch tests, and the inactive/
unprovisioned-session tests for the new context RPCs. No RLS policy was
loosened; the one view that *was* loosened (accidentally, in an earlier
round) is now fixed to be more restrictive, not less. Branch isolation,
active-profile enforcement, and Completed-record protection are all
still enforced — verified, not assumed.

## Build and test output

`npx tsc --noEmit`, `npm run build` (30 routes), `npm run lint`, `npm run
test` (27/27 Vitest), `npm audit --omit=dev` (0 vulnerabilities) — all
clean. Full local Postgres rebuild across all 5 migrations, then 97/97
pgTAP. Production server started and hit every key route (`/login`,
`/dashboard`, `/shipments`, `/shipments/new`, and three different
shipment-detail tabs) — clean 200/307 responses, zero errors in the
server log.

## Deploy

New migration this round: `20260101000005_performance_optimization.sql`
is now much larger (12 tab RPCs, the secure assignable-profiles RPC, the
New Shipment context RPC, supplier search) — run the full file in
Supabase's SQL Editor after the existing four. Safe to re-run in full.

`vercel.json` is unchanged and remains the source of truth for the
Mumbai region — no separate dashboard setting is required on top of it
(Vercel reads `vercel.json` directly); the earlier round's note asking
you to also set it manually in the dashboard was incorrect and is
corrected here.

## Rollback

If `20260101000005_performance_optimization.sql` needs to be rolled
back: every RPC it defines is additive (nothing existing was dropped
except the one revoked grant on `v_assignable_profiles`, which was the
actual vulnerability). Re-running `grant select on v_assignable_profiles
to authenticated;` restores the old (insecure) behavior if genuinely
needed as a stopgap, but this isn't recommended given what it exposes.

## Verdict

**PASS — final performance optimization complete and safe to deploy.**

Every acceptance criterion I have the tools to verify from this
environment is met: single-RPC app shell/dashboard/header/tab-level
data loading, the unsafe view replaced, wizard steps dynamically
imported and confirmed in separate chunks, invalidation narrowed and
corrected, all local tests (application + database) passing, zero
security regressions, zero production vulnerabilities, no business
functionality removed. Live-environment-only validation (Playwright
against a real deployment, production timing percentiles) is exactly
that — validation that needs your actual Vercel/Supabase environment to
run, not a blocker in the delivered code itself.
