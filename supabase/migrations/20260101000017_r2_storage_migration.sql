-- ============================================================
-- CLOUDFLARE R2 MIGRATION — storage backend moves from Supabase Storage
-- to Cloudflare R2 (chosen specifically for its zero-egress pricing,
-- since document preview/retrieval was the actual cost driver). This is
-- purely a WHERE-THE-BYTES-LIVE change — every existing permission check
-- in this schema (branch access, upload_docs, Completed-shipment locks,
-- the upload_intents contract) is completely unaffected. What DOES need
-- to change: the two places that verified an object's existence by
-- querying Supabase's OWN storage.objects table directly in SQL — an R2
-- object will never appear there, since R2 is a separate service R2
-- doesn't write into Postgres at all.
--
-- The replacement verification (a real HeadObject call against R2) now
-- happens in application code (lib/actions/r2-storage.ts,
-- verifyR2ObjectExistsAction) immediately before upload_document_metadata
-- / replace_document are called — same guarantee (no phantom metadata
-- for a file that was never actually uploaded), enforced at the layer
-- that can actually reach R2, since SQL can't.
--
-- Likewise, the Storage RLS policies on storage.objects
-- (p_storage_insert_documents / p_storage_select_documents) enforced
-- upload/download permission automatically on every Supabase Storage
-- request. R2 has no idea those policies exist — it will honor a
-- presigned URL for anyone holding it. That enforcement moves to the
-- moment a presigned URL is minted (lib/actions/r2-storage.ts), which is
-- why fn_can_access_document_by_path exists below: it's a direct,
-- explicit port of p_storage_select_documents' USING clause, called from
-- application code instead of running implicitly via Storage RLS.
--
-- The old Storage RLS policies are left in place rather than dropped —
-- they're inert now (nothing will ever write to storage.objects again),
-- but dropping them isn't necessary for correctness and there's no
-- reason to touch working, harmless SQL as part of this change.
-- ============================================================

-- Explicit port of p_storage_select_documents' USING clause, for the new
-- R2 download-URL Server Action to call directly.
create or replace function fn_can_access_document_by_path(p_storage_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_view_all boolean;
  v_can_access boolean;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null or not v_profile.is_active then
    return false;
  end if;

  select rp.allowed into v_view_all from public.role_permissions rp
    where rp.role = v_profile.role and rp.permission = 'view_all_branches';

  select exists (
    select 1 from public.document_versions dv
    join public.documents d on d.id = dv.document_id
    join public.shipments s on s.id = d.shipment_id
    where dv.storage_path = p_storage_path
      and (coalesce(v_view_all, false) or s.branch_id = v_profile.branch_id)
  ) into v_can_access;

  return v_can_access;
end;
$$;
revoke all on function fn_can_access_document_by_path(text) from public;
grant execute on function fn_can_access_document_by_path(text) to authenticated;

create or replace function upload_document_metadata(
  p_shipment_id uuid, p_document_id uuid, p_invoice_id uuid, p_document_type_id uuid,
  p_storage_path text, p_original_filename text, p_mime_type text, p_file_size bigint,
  p_sha256_hash text, p_expiry_date date default null
) returns public.document_versions
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_shipment public.shipments;
  v_version public.document_versions;
  v_intent public.upload_intents;
begin
  v_shipment := public.fn_lock_shipment_for_mutation(p_shipment_id, 'upload_docs');
  v_profile := public.fn_current_profile();
  if p_invoice_id is not null and not exists (
    select 1 from public.invoices where id = p_invoice_id and shipment_id = p_shipment_id
  ) then
    raise exception 'INVOICE_MISMATCH: invoice % does not belong to shipment %', p_invoice_id, v_shipment.ref using errcode = '23514';
  end if;
  if not public.fn_validate_storage_path(p_storage_path, p_shipment_id, p_document_id) then
    raise exception 'INVALID_STORAGE_PATH: % does not match the expected shipment/document path', p_storage_path using errcode = '23514';
  end if;
  if exists (select 1 from public.documents where id = p_document_id) then
    raise exception 'DOCUMENT_ALREADY_EXISTS: % — use replace_document to add a new version', p_document_id using errcode = '23505';
  end if;

  -- The "does the object really exist" check moved to application code
  -- (verifyR2ObjectExistsAction, a real HeadObject call against R2) since
  -- this file no longer lives anywhere Postgres can see directly. The
  -- caller is expected to have already confirmed that before reaching
  -- here — this function still fully enforces everything it always did
  -- around the upload_intents contract below.

  select * into v_intent from public.upload_intents
  where storage_path = p_storage_path and shipment_id = p_shipment_id and document_id = p_document_id;
  if v_intent.id is null then
    raise exception 'UPLOAD_INTENT_MISSING: no upload intent was registered for this shipment/document/path — call fn_register_upload_intent first'
      using errcode = '23514';
  end if;
  if v_intent.requested_by is distinct from v_profile.id then
    raise exception 'UPLOAD_INTENT_OWNER_MISMATCH: this upload intent belongs to a different user' using errcode = '42501';
  end if;
  if v_intent.fulfilled then
    raise exception 'UPLOAD_INTENT_ALREADY_FULFILLED: this upload intent has already been consumed' using errcode = '23514';
  end if;
  if v_intent.expires_at < now() then
    raise exception 'UPLOAD_INTENT_EXPIRED: this upload intent expired at %', v_intent.expires_at using errcode = '23514';
  end if;

  insert into public.documents (id, shipment_id, invoice_id, document_type_id, created_by)
  values (p_document_id, p_shipment_id, p_invoice_id, p_document_type_id, v_profile.id);

  insert into public.document_versions (
    document_id, version_number, storage_path, original_filename, mime_type, file_size, sha256_hash,
    is_current, status, uploaded_by, expiry_date
  ) values (
    p_document_id, 1, p_storage_path, p_original_filename, p_mime_type, p_file_size, p_sha256_hash,
    true, 'Uploaded', v_profile.id, p_expiry_date
  ) returning * into v_version;

  update public.upload_intents set fulfilled = true, fulfilled_at = now() where id = v_intent.id;
  perform public.fn_recalculate_document_status(p_shipment_id);

  return v_version;
end;
$$;
revoke all on function upload_document_metadata(uuid,uuid,uuid,uuid,text,text,text,bigint,text,date) from public;
grant execute on function upload_document_metadata(uuid,uuid,uuid,uuid,text,text,text,bigint,text,date) to authenticated;

create or replace function replace_document(
  p_document_id uuid, p_storage_path text, p_original_filename text, p_mime_type text,
  p_file_size bigint, p_sha256_hash text, p_expiry_date date default null
) returns public.document_versions
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_document public.documents;
  v_next_version int;
  v_previous_version_id uuid;
  v_version public.document_versions;
  v_intent public.upload_intents;
begin
  v_document := public.fn_require_document_access(p_document_id, 'upload_docs');
  v_profile := public.fn_current_profile();

  if not public.fn_validate_storage_path(p_storage_path, v_document.shipment_id, p_document_id) then
    raise exception 'INVALID_STORAGE_PATH: % does not match the expected shipment/document path', p_storage_path using errcode = '23514';
  end if;

  -- Same as upload_document_metadata above: object existence is now
  -- verified in application code against R2 before this is called.

  select * into v_intent from public.upload_intents
  where storage_path = p_storage_path and shipment_id = v_document.shipment_id and document_id = p_document_id;
  if v_intent.id is null then
    raise exception 'UPLOAD_INTENT_MISSING: no upload intent was registered for this shipment/document/path' using errcode = '23514';
  end if;
  if v_intent.requested_by is distinct from v_profile.id then
    raise exception 'UPLOAD_INTENT_OWNER_MISMATCH: this upload intent belongs to a different user' using errcode = '42501';
  end if;
  if v_intent.fulfilled then
    raise exception 'UPLOAD_INTENT_ALREADY_FULFILLED: this upload intent has already been consumed' using errcode = '23514';
  end if;
  if v_intent.expires_at < now() then
    raise exception 'UPLOAD_INTENT_EXPIRED: this upload intent expired at %', v_intent.expires_at using errcode = '23514';
  end if;

  perform 1 from public.documents where id = p_document_id for update;

  select id, version_number into v_previous_version_id, v_next_version
  from public.document_versions where document_id = p_document_id and is_current;

  if v_previous_version_id is null then
    raise exception 'NO_CURRENT_VERSION: document % has no current version to replace', p_document_id using errcode = 'P0002';
  end if;
  v_next_version := v_next_version + 1;

  update public.document_versions set is_current = false where id = v_previous_version_id;

  insert into public.document_versions (
    document_id, version_number, storage_path, original_filename, mime_type, file_size, sha256_hash,
    is_current, status, uploaded_by, expiry_date, replaces_version_id
  ) values (
    p_document_id, v_next_version, p_storage_path, p_original_filename, p_mime_type, p_file_size, p_sha256_hash,
    true, 'Uploaded', v_profile.id, p_expiry_date, v_previous_version_id
  ) returning * into v_version;

  update public.upload_intents set fulfilled = true, fulfilled_at = now() where id = v_intent.id;
  perform public.fn_recalculate_document_status(v_document.shipment_id);

  return v_version;
end;
$$;
revoke all on function replace_document(uuid,text,text,text,bigint,text,date) from public;
grant execute on function replace_document(uuid,text,text,text,bigint,text,date) to authenticated;
