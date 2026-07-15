# Performance Fix — Tab Navigation Latency

## The problem you reported

Every tab click on the shipment detail page ("Transport", "Invoices",
"Dubai Customs", etc.) was taking several seconds.

## Two likely causes

**1. Region mismatch (needs your input, not fixable in code).** Your
Supabase project is in Mumbai — the closest available region to the UAE,
since Supabase has no dedicated Middle East region. If Vercel's function
region isn't set close to Mumbai, every database call travels much
further than it needs to. Check **Vercel → Project Settings →
Functions → Function Region**.

**2. Redundant master-data fetching on every navigation (fixed here).**
Each tab page was re-querying Supabase for reference data — airlines,
ports, agents, carriers, couriers, document types, currencies,
categories, branches — that barely ever changes, on every single click.
Combined with the shipment data fetch and a permission check, that was
4-6+ separate network round-trips per tab, every time.

## The fix

- New migration `20260101000004_public_reference_data.sql`: relaxes RLS
  on these 11 specific reference tables (not confidential — an airline's
  name or a port code isn't sensitive, unlike shipments or profiles) to
  `using (true)` and grants `anon` read access.
- New `lib/supabase/public-client.ts`: a cookie-independent Supabase
  client, safe to use inside a cross-request cache.
- New `lib/data/master-data.ts`: wraps each reference-data lookup in
  `unstable_cache` with a 5-minute revalidation window.
- All 7 tab pages + the New Shipment page now use these cached fetchers
  instead of querying Supabase directly for reference data.

## A bug I caught in my own first attempt at this fix

My first draft of `master-data.ts` called the regular cookie-aware
`createClient()` inside `unstable_cache`. Next.js explicitly documents
that reading cookies inside a cached scope isn't supported — I caught
this by re-reading the relevant docs before shipping it, not by trial and
error in production. That's what led to the RLS-relaxation approach
above, rather than a version that might have behaved unpredictably (or
worse, leaked one user's session into a cache shared across users).

## Verified

- `npx tsc --noEmit`, `npm run build` (all 17 routes), `npm run lint`,
  `npm run test` (21/21 Vitest) — all clean
- Full local Postgres rebuild with the new migration — clean
- Direct query as `anon` (no session at all): confirmed it can now read
  `airlines` (5 rows) and still correctly cannot read `shipments`
  ("permission denied") — the relaxation is scoped exactly to the
  intended tables, nothing else
- Full 71-assertion pgTAP suite — still 71/71, no regressions

## What to do

1. Apply the new migration to your live project (SQL Editor, same as
   before) — it's the one new file,
   `supabase/migrations/20260101000004_public_reference_data.sql`.
2. Check Vercel's function region setting and let me know what it shows —
   if it's not close to Mumbai, that's likely still contributing even
   after this fix.
3. Redeploy (push this code) and click through the tabs again — should be
   noticeably faster. Tell me if it still feels slow, and if so, whether
   it's uniformly slow across all tabs or worse on specific ones.
