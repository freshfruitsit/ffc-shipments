# Live Flight Status (AviationStack integration)

A "Check live status" panel on the Transport tab (desktop) and shipment
detail (mobile PWA) that looks up the shipment's actual flight number
against real airline data via AviationStack's API.

## Why not scrape an airline's website

Explicitly avoided — pulling data from Emirates' (or any airline's) own
site by automated means would likely violate their terms of service and
breaks the moment they change their page. AviationStack is a legitimate,
purpose-built data provider used for exactly this.

## How the status mapping works

AviationStack's own status vocabulary (`scheduled`, `active`, `landed`,
`cancelled`, `incident`, `diverted`) doesn't map cleanly onto this app's
`flight_status` (`Booked`, `Manifested`, `Departed`, `Delayed`, `In
Transit`, `Cancelled`) — so nothing is auto-applied. The panel shows the
real reported status, delay minutes, and departure/arrival times, plus a
**suggested** mapping the user confirms with one tap:

- `cancelled` → **Cancelled** (checked first — takes priority even if
  stale delay data is still attached to a since-cancelled flight)
- departure delay ≥ 15 minutes → **Delayed** (regardless of whether
  AviationStack still calls it `scheduled` or already `active` — delay
  is a separate field from their status, not a status value itself)
- `scheduled` → **Booked**
- `active` → **Departed**
- `landed` → **Departed** (closest available match — this schema
  doesn't track "arrived" as distinct from "departed")
- `incident` / `diverted` → **no suggestion at all**. These need a
  person's judgment, not a guess.
- **Never** suggests `In Transit` — that specifically means the
  shipment is connecting through a layover airport, a real business
  concept a single flight-number lookup has no way to know.

Applying a suggestion goes through `update_shipment_transport` — the
existing RPC, not a new write path — after first fetching the shipment's
current transport record, since that RPC updates the full record rather
than patching a single field. Nothing else on the shipment (AWB,
weights, remarks, etc.) is touched.

## Real bug found and fixed by its own test

The status-mapping function checked "is this delayed?" *before* checking
"is this cancelled?" — meaning a cancelled flight that still had stale
delay data attached (a real AviationStack response shape: delay data can
persist after cancellation) would have been suggested as **Delayed**
instead of **Cancelled**. Caught by the unit test written for this exact
function, not by inspection — cancelled now always takes priority.

## Verified for real

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx next build` — clean (confirms a missing `AVIATIONSTACK_API_KEY`
  doesn't break the build — it's only read at request time, same
  pattern as R2).
- `npx vitest run` — 49/49 (9 new, directly targeting the mapping
  function, including the priority-ordering bug above and an explicit
  check that `In Transit` is never suggested under any input).
- `npm audit --omit=dev` — 0 vulnerabilities.
- No SQL changes — this reuses `get_shipment_transport_tab` and
  `update_shipment_transport` exactly as they already exist.

## Cannot be verified in this environment, by design constraint

**An actual live API call.** This sandbox can't reach
`api.aviationstack.com` — the request/response shape here is built
directly from AviationStack's own official documentation (fetched and
read in full, not from memory), but a real end-to-end call — enter a
real flight number, click Check now, confirm real data comes back — is
worth doing yourself once the API key is live in Vercel.

## Known simplifications (by design)

- Looks up the *current* flight_iata match only — doesn't pass a
  specific date, since AviationStack's date-filtered historical lookups
  need a paid plan. For a shipment with an ETA well in the future or
  today, this should find the right flight; for one further out, the
  lookup may come back empty until closer to the date.
- One lookup per click, not continuous background polling — deliberate,
  to keep API usage (and cost) predictable rather than racking up calls
  automatically across every active shipment.
