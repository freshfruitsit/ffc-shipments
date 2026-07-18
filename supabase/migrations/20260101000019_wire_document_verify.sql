-- ============================================================
-- REAL GAP FOUND WHILE INVESTIGATING THE CHANGE-STATUS FIX — for any
-- shipment category with configured required_documents (which real
-- categories like "Fresh Fruits and Vegetables" have), document_status
-- can only ever reach 'Complete'/'Verified' (the two values
-- change_shipment_status accepts for "Ready for Submission") by every
-- required document actually being verified. verify_document already
-- existed as a working, permission-gated RPC (Module 2) — it was simply
-- never wired into the frontend at all. This was explicitly flagged as a
-- known gap in Module 2's changelog ("Document verify/archive RPCs exist
-- but aren't wired into the Documents tab UI yet") but the practical
-- consequence — that this makes it IMPOSSIBLE to ever reach Ready for
-- Submission for a real shipment — wasn't obvious until it actually
-- blocked someone.
--
-- get_shipment_documents_tab already returns everything needed to build
-- a Verify button EXCEPT the one thing actually required to call
-- verify_document: the document_version's own id (only version_number,
-- status, storage_path, etc. were included — not the row's id at all).
-- This migration adds it. Nothing else about this function changes.
-- ============================================================

create or replace function get_shipment_documents_tab(p_shipment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_shipment public.shipments;
  v_profile public.profiles;
  v_documents jsonb;
begin
  v_shipment := public.fn_require_shipment_access(p_shipment_id, null);
  select * into v_profile from public.profiles pr where pr.id = auth.uid();

  select coalesce(jsonb_agg(jsonb_build_object(
    'document_id', d.id,
    'document_type_name', (select dt.name from public.document_types dt where dt.id = d.document_type_id),
    'invoice_no', (select i.invoice_no from public.invoices i where i.id = d.invoice_id),
    'version_count', (select count(*) from public.document_versions dv2 where dv2.document_id = d.id),
    'current_version', jsonb_build_object(
      'id', cv.id,
      'version_number', cv.version_number, 'status', cv.status, 'storage_path', cv.storage_path,
      'original_filename', cv.original_filename, 'uploaded_at', cv.uploaded_at,
      'uploaded_by_name', (select pr2.full_name from public.profiles pr2 where pr2.id = cv.uploaded_by),
      'verified_by_name', (select pr3.full_name from public.profiles pr3 where pr3.id = cv.verified_by),
      'expiry_date', cv.expiry_date
    )
  ) order by cv.uploaded_at desc), '[]'::jsonb) into v_documents
  from public.documents d
  join public.document_versions cv on cv.document_id = d.id and cv.is_current
  where d.shipment_id = p_shipment_id;

  return jsonb_build_object(
    'documents', v_documents,
    'can_upload', public.fn_permission_for(v_profile.role, 'upload_docs') and v_shipment.overall_status <> 'Completed',
    'can_verify', public.fn_permission_for(v_profile.role, 'verify_docs') and v_shipment.overall_status <> 'Completed'
  );
end;
$$;
revoke all on function get_shipment_documents_tab(uuid) from public;
grant execute on function get_shipment_documents_tab(uuid) to authenticated;

-- A second latent bug surfaced by actually calling verify_document for
-- the first time (it was never exercised before, since nothing in the
-- frontend called it): its UPDATE set a CASE expression with two string-
-- literal branches directly against the status column, which Postgres
-- doesn't reliably auto-cast to the doc_version_status enum in this
-- context. Fixed with an explicit cast — everything else about the
-- function (permission check, is_current/Archived guards, the
-- recalculate-document-status call) was already correct.
create or replace function verify_document(p_document_version_id uuid, p_approve boolean, p_remarks text default null)
returns public.document_versions
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_version public.document_versions;
  v_document public.documents;
begin
  select * into v_version from public.document_versions where id = p_document_version_id;
  if v_version.id is null then
    raise exception 'NOT_FOUND: document version % does not exist', p_document_version_id using errcode = 'P0002';
  end if;

  v_document := public.fn_require_document_access(v_version.document_id, 'verify_docs');
  v_profile := public.fn_current_profile();

  if not v_version.is_current then
    raise exception 'NOT_CURRENT_VERSION: only the current version of a document may be verified' using errcode = '42501';
  end if;
  if v_version.status = 'Archived' then
    raise exception 'DOCUMENT_ARCHIVED: an archived version cannot be verified' using errcode = '42501';
  end if;

  update public.document_versions set
    status = (case when p_approve then 'Verified' else 'Rejected' end)::public.doc_version_status,
    verified_by = v_profile.id, verified_at = now(), remarks = coalesce(p_remarks, remarks)
  where id = p_document_version_id returning * into v_version;

  perform public.fn_recalculate_document_status(v_document.shipment_id);

  return v_version;
end;
$$;
revoke all on function verify_document(uuid,boolean,text) from public;
grant execute on function verify_document(uuid,boolean,text) to authenticated;
