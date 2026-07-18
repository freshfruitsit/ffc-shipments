# FFC Field — Mobile PWA

A new, installable mobile companion for the Air Freight team — find a
shipment, see exactly where it stands, and change its status, in a UI
built for one-handed use on a phone at the airport or in a customs
office, not a shrunk-down copy of the desktop app.

## What was built

**Installable PWA**: manifest, service worker, real app icons generated
from your existing FFC logo. "Add to Home Screen" on iOS/Android gives
staff a genuine app icon that opens straight into the mobile experience,
no browser chrome.

**Three screens**, reachable from a bottom tab bar:
- **Search** (`/m`) — find any shipment by reference, AWB, or supplier.
- **My Shipments** (`/m/mine`) — everything currently assigned to you.
- **Profile** (`/m/profile`) — who you are, your role/branch, sign out.

**Shipment detail** (`/m/shipments/[id]`) — the real destination:
- The signature **flight-path visual**: a route line with a plane marking
  the shipment's actual current stage, styled after real flight-tracker
  apps. This is the one deliberate design risk taken here — everything
  else on the screen stays quiet around it.
- All 6 module statuses (Documents, Customs, Municipality, Delivery
  Order, MOFAIC, Physical Documents) shown clearly at a glance — this is
  the "get the know status" half of the request.
- A **Change Status** action, sheet-based (mobile-native, not a desktop
  modal squeezed onto a phone) — this is the "update the status" half.
  Only shows transitions the signed-in user's role can actually make
  (same permission-filtered list the desktop's Change Status panel uses),
  and asks for a reason exactly when the transition requires one.

Every screen runs on your **real, existing backend** — the same
`search_shipments`, `get_shipment_header_context`, and
`change_shipment_status` RPCs the desktop app already uses. This is not
a separate app with duplicated logic; it's a second, purpose-built face
on the same system, same auth, same permissions, same data.

## Design decisions, stated plainly

**Color**: kept your existing FFC green rather than inventing an
unrelated palette — same company, same brand, different form factor. One
new accent added specifically for this app: a deep amber
(`#B8860B`, aviation instrument-panel amber), used only for "in
progress" states.

**Type**: Space Grotesk for headings (has real character, distinct from
the desktop app's plain system font) paired with Inter for body text and
JetBrains Mono for reference/AWB codes — monospacing genuinely helps here,
the way boarding passes and tracking labels are set, so codes are easier
to visually verify.

**Why status updates are scoped to Overall Status only, for now**:
Overall Status is the field that actually drives the shipment's
lifecycle — it's what "update the status" most naturally means, and it's
a single, already-well-defined action (`change_shipment_status`, with a
clean list of valid next states). The 6 module-level statuses
(Customs, Municipality, etc.) each have their own real forms on desktop
with fields beyond just the status value (dates, references, remarks) —
building all 5 of those as genuine quick-edit flows, done properly, is
real additional scope. This version shows all 6 clearly and updates the
one that matters most for moving a shipment forward; a natural, clearly
scoped next step if wanted.

## A real bug fixed along the way

Login always redirected to `/dashboard` after signing in, regardless of
where you came from. That meant opening the installed PWA icon while
signed out would sign you in and then dump you on the desktop dashboard,
not back into the mobile app — a genuinely broken "open the app" moment
for a PWA specifically. Fixed: login now respects a `?next=` redirect
target (validated as a genuine same-origin relative path, so this can't
become an open-redirect vector), and the PWA's own auth flow sets it
automatically.

## Verified for real

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx next build` — clean, all `/m/*` routes present (including fixing a
  real `useSearchParams` Suspense-boundary requirement surfaced on
  `/login` by the `next`-param fix above).
- `npx vitest run` — 40/40 (unchanged; no new unit-testable logic here).
- `npm audit --omit=dev` — 0 vulnerabilities on the two new font packages.
- No SQL changes at all — this reuses existing RPCs entirely, plus one
  plain `select` against `shipments` (respects the same branch-scoped RLS
  every other read in this app already goes through).

## Cannot be verified in this environment, by design constraint

**Actual install behavior on a real phone.** This sandbox has no mobile
browser to test "Add to Home Screen," standalone-mode rendering, or the
service worker's offline fallback against a real network drop. The code
follows the standard, well-documented PWA spec exactly (manifest fields,
service worker lifecycle, icon purposes), but a real device test — install
the icon, turn on airplane mode, confirm the offline screen shows instead
of a browser error — is worth doing yourself once this is deployed.

## Known simplifications (by design, not oversight)

- Only Overall Status is quick-editable from mobile (see above) — the 6
  module statuses are view-only here.
- No push notifications yet — the service worker is set up for offline
  app-shell caching only, not background push. A real, valuable next
  step if the team wants alerts (e.g., "shipment assigned to you") to
  reach the phone even when the app isn't open.
- No offline data caching for shipment content itself — deliberately
  network-first for everything Supabase-related (a stale status shown as
  current could send someone to the wrong outcome), so "offline" here
  means "can't do anything until reconnected," not "keeps working with
  cached data." A reasonable trade-off for this business, not a
  half-finished offline mode.
- Search results aren't branch-filtered any differently than desktop —
  same RLS, same visibility rules, nothing new to reason about there.
