# Storage Migration: Supabase Storage → Cloudflare R2

Document storage moved off Supabase Storage to Cloudflare R2, specifically
to fix the reported cost problem — R2 charges **$0.00 for egress** (every
document preview/download), where Supabase Storage's underlying S3-based
egress cost was the actual driver of that bill. Storage itself is also
cheaper ($0.015/GB vs Supabase's pass-through S3 rate).

## What changed, and what didn't

**Zero changes to the permission model.** Branch access, `upload_docs`
permission, Completed-shipment locks, the whole `upload_intents` contract
(matching path, single-use, expiring, owned-by-caller) — all identical.
This was deliberately scoped as "move where the bytes live," not "redesign
document security."

**What genuinely had to change**, because R2 has no concept of Postgres
RLS at all — it's a separate service that will honor a presigned URL for
whoever holds it, full stop:

1. **Two SQL functions** (`upload_document_metadata`, `replace_document`)
   used to verify an upload actually happened by checking Supabase's own
   `storage.objects` table directly in SQL. An R2 object will never
   appear there. That check moved to application code
   (`verifyR2ObjectExistsAction` — a real `HeadObject` call against R2),
   run immediately before either RPC is called. Same guarantee, enforced
   at the layer that can actually reach R2.
2. **The old Storage RLS policies** (`p_storage_insert_documents` /
   `p_storage_select_documents`) enforced upload/download permission
   automatically on every Supabase Storage request. That enforcement now
   lives in `lib/actions/r2-storage.ts`, at the exact moment a presigned
   URL is minted — `getR2UploadUrlAction` and
   `getR2DownloadUrlAction`/`fn_can_access_document_by_path` are direct,
   explicit ports of those two policies' logic, not new rules invented
   for this migration. The old policies are left in the schema (they're
   inert now — nothing will ever write to `storage.objects` again — but
   there's no reason to touch working SQL that isn't broken).

**New dependency:** `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
— R2 is S3-API-compatible, so the standard AWS SDK works against it
unchanged; only the endpoint differs. Also added `server-only` (a
zero-dependency Next.js safety package) to `lib/storage/r2-client.ts`, so
R2 credentials can never accidentally end up in a client bundle.

## New environment variables (required)

```
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET_NAME=your-bucket-name
```

Add these to **both** `.env.local` (for local dev) and Vercel → Settings
→ Environment Variables (Production and Preview) — see
`.env.local.example` for the full setup instructions (creating the
bucket, scoping the API token correctly).

**These are server-only secrets.** Never prefix them with
`NEXT_PUBLIC_`. Nothing in this app needs them client-side — every R2
operation happens inside a Server Action.

## Verified for real

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx vitest run` — 40/40 (unchanged; no unit-testable logic here).
- `npx next build` — clean, all 32 routes present, confirms missing R2
  env vars don't break the build itself (they're only read at request
  time inside Server Actions, never during the build).
- `npm audit --omit=dev` — 0 vulnerabilities, including both new AWS SDK
  packages.
- **Full clean-rebuild pgTAP run: 125/125 assertions pass** (down from
  126 — two obsolete tests that specifically checked the now-removed
  `storage.objects` existence check were replaced with one that checks
  the thing that's actually still enforced: rejecting an upload with no
  registered intent at all).
- Functionally verified the new `fn_can_access_document_by_path` function
  directly against real data in three cases: a real document from the
  caller's own branch (→ true), the same document from a different
  branch (→ false), and a path that doesn't exist at all (→ false).

## Cannot be verified in this environment, by design constraint

**Actual connectivity to Cloudflare R2.** This sandbox's network egress
is restricted to a specific allowlist of domains (npm registry, GitHub,
PyPI, etc.) that does not include `*.r2.cloudflarestorage.com` — so while
the code compiles cleanly and the SQL-side logic is fully tested, a real
end-to-end upload → preview → replace → archive cycle against your actual
R2 bucket has **not** been exercised here. This is the one thing I'd
genuinely recommend testing manually yourself once this is deployed with
real credentials, before trusting it for anything real:

1. Upload a document on a real shipment.
2. Confirm it appears in the document list immediately (no reload lost
   state).
3. Click Preview — confirm the file actually opens.
4. Replace it with a different file — confirm the version number
   increments and Preview still works.
5. Archive it — confirm it's removed from the active list.

If anything in that sequence doesn't work, the error message shown should
point at exactly which step failed (each one has a distinct, specific
error rather than a generic "something went wrong").

## Known simplifications (by design, not oversight)

- No migration of existing documents — confirmed this is fine since the
  current documents are test data, not real production files.
- Presigned URLs expire after 5 minutes (upload and download both) —
  reasonable for interactive use; if very large files start timing out
  mid-upload on slow connections, this is the number to revisit.
- The old Storage RLS policies were left in the schema rather than
  dropped. They're harmless (nothing will trigger them), and removing
  working SQL that isn't causing a problem isn't worth the risk for this
  change specifically.
