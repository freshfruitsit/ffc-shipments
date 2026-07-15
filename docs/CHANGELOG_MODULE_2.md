# Module 2 — Full Shipment Detail, Documents, and Portal Workflows

Builds directly on Module 1.1. Nothing in Module 1.1 was removed — the
simplified quick-create form still exists; this module is where the rest
of the prototype's feature set (transport, invoices, documents, and the
five government-portal workflows) actually gets built into the shipment
detail page.

## What's new

**Tabbed shipment detail** (`app/(app)/shipments/[id]/`) — a shared
layout + tab navigation, with 10 tabs:

| Tab | RPC(s) called | Notes |
|---|---|---|
| Overview | (read-only) | Moved from the old single-page detail view; adds a "Ready to complete" banner driven by `completion_eligible` |
| Transport | `update_shipment_transport` | AWB, airline, flight, ETA, port, freight/clearing agent, packages, weights |
| Invoices | `add_invoice` | List + add form; multiple invoices per shipment |
| Documents | `fn_register_upload_intent` → Storage → `upload_document_metadata` | Real upload flow, not a placeholder — see below |
| Dubai Customs | `update_customs` | Declaration number, status, submission date, result |
| Dubai Municipality | `update_municipality` | Draft/submitted references, status, dates |
| Delivery Order | `update_delivery_order` | Carrier, status, requested/received dates |
| MOFAIC | `update_mofaic` | Status, reference, payment amount/currency/date |
| Physical Documents | `update_physical_documents` | Status, originals/dispatch/POD flags, courier, tracking |
| Comments | `add_comment` | List + add; author names resolved via the safe `v_assignable_profiles` view, not the restricted `profiles` table |

Every editable tab respects the same rules the schema already enforces:
read-only once the shipment is `Completed`, and the "Save" button simply
doesn't render if the signed-in role lacks the relevant permission — the
RPC's own permission check is still the real security boundary, this is
just the matching UX.

## Document upload — the real flow, not a stub

1. Browser asks a Server Action to register an upload intent
   (`fn_register_upload_intent`) — this is what the Storage INSERT policy
   checks before allowing anything.
2. Browser calls Supabase Storage directly (`createSignedUploadUrl` →
   `uploadToSignedUrl`) — the file bytes never pass through a Server
   Action, avoiding body-size limits for large scans/PDFs.
3. Browser computes a SHA-256 hash client-side (`crypto.subtle.digest`)
   and calls a second Server Action to finalize the metadata
   (`upload_document_metadata`), which independently re-verifies the
   Storage object actually exists and the intent is valid before accepting
   it — a client can't register a phantom document by lying about any of
   this.

## A real gap found and fixed while building this

The Storage **bucket itself** (`shipment-documents`) was never actually
created in any migration — only referenced by RLS policies and RPC
functions. Without it, every upload would have failed with "bucket not
found" on a real project. Added to
`supabase/migrations/20260101000002_security_and_rls.sql`:

```sql
insert into storage.buckets (id, name, public, file_size_limit)
values ('shipment-documents', 'shipment-documents', false, 52428800)
on conflict (id) do nothing;
```

Found and fixed **before** you'd have hit it — verified with a real local
Postgres rebuild + the full 71-assertion pgTAP suite (unaffected, still
71/71) plus a dedicated confirmation query showing the bucket row exists
after migration.

## Verification performed

- `npx tsc --noEmit` — clean
- `npm run build` — clean, all 17 routes recognized (7 from Module 1.1 + 10 new tabs)
- `npm run lint` — clean
- `npm run test` (Vitest) — 21/21, unchanged from Module 1.1
- `npm audit --omit=dev` — 0 vulnerabilities, unchanged
- Full local Postgres + pgTAP rebuild — 71/71, unchanged
- **New**: a dedicated functional smoke test calling every one of
  `update_shipment_transport`, `add_invoice`, `update_customs`,
  `update_municipality`, `update_delivery_order`, `update_mofaic`,
  `update_physical_documents`, and `add_comment` in sequence against a
  real seeded shipment, confirming each one actually persists the
  expected values — not just that the RPCs exist and compile

## Still not covered (honest gaps)

- No dedicated "responsible user" picker on the delivery-order/MOFAIC/
  physical-docs sub-forms yet — those fields are wired in the schema and
  the RPCs, just not exposed in these forms yet (they submit `null` for
  now). `v_assignable_profiles` is already in place for when this gets
  built.
- Document verification/archive (the `verify_document`/`archive_document`
  RPCs) aren't wired into the UI yet — documents can be uploaded and
  downloaded, but not verified/rejected/archived from this screen yet.
- No dedicated Playwright coverage added for the new tabs in this pass —
  the existing Module 1.1 E2E suite (unrun here, same Playwright-binary
  limitation as before) would need extending before this ships to real users.
- Exceptions, resubmissions, notifications, reports, audit log UI, and
  historical import are still Module 3+ per the original roadmap.
