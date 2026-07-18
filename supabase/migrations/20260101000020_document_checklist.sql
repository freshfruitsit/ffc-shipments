-- ============================================================
-- CHECKLIST UPLOAD UX — per direct request, replacing the one-type-at-a-
-- time upload flow with a checklist of the shipment's actual required
-- document types (from required_documents, category + optional origin-
-- country specific), each with its own inline upload slot. This
-- migration adds the one thing the frontend needs that wasn't already
-- available: for each required type, whether it's already fulfilled and
-- by which document/version.
--
-- Everything else about the underlying model is unchanged — this is a
-- read-shape addition, not a new table or a new write path. The
-- existing 'documents' array (every uploaded document regardless of
-- type) stays exactly as it was, so anything uploaded under a
-- non-required type (like "Other") or as a duplicate still shows up
-- there for the "additional documents" section.
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
  v_checklist jsonb;
begin
  v_shipment := public.fn_require_shipment_access(p_shipment_id, null);
  select * into v_profile from public.profiles pr where pr.id = auth.uid();

  select coalesce(jsonb_agg(jsonb_build_object(
    'document_id', d.id,
    'document_type_id', d.document_type_id,
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

  -- One row per required type for this shipment's category (+ optional
  -- origin-country-specific rule), left-joined against whatever's
  -- actually been uploaded for that exact type on THIS shipment — so the
  -- checklist always reflects the real, current fulfillment state.
  select coalesce(jsonb_agg(jsonb_build_object(
    'document_type_id', rd.document_type_id,
    'document_type_name', dt.name,
    'fulfilled_document_id', d.id,
    'fulfilled_version_id', cv.id,
    'status', cv.status,
    'filename', cv.original_filename,
    'version_number', cv.version_number,
    'storage_path', cv.storage_path,
    'uploaded_at', cv.uploaded_at,
    'uploaded_by_name', (select pr4.full_name from public.profiles pr4 where pr4.id = cv.uploaded_by)
  ) order by dt.display_order), '[]'::jsonb) into v_checklist
  from public.required_documents rd
  join public.document_types dt on dt.id = rd.document_type_id
  left join public.documents d on d.shipment_id = p_shipment_id and d.document_type_id = rd.document_type_id
  left join public.document_versions cv on cv.document_id = d.id and cv.is_current
  where rd.category_id = v_shipment.category_id
    and rd.is_active
    and (rd.origin_country_id is null or rd.origin_country_id = v_shipment.origin_country_id);

  return jsonb_build_object(
    'documents', v_documents,
    'checklist', v_checklist,
    'can_upload', public.fn_permission_for(v_profile.role, 'upload_docs') and v_shipment.overall_status <> 'Completed',
    'can_verify', public.fn_permission_for(v_profile.role, 'verify_docs') and v_shipment.overall_status <> 'Completed'
  );
end;
$$;
revoke all on function get_shipment_documents_tab(uuid) from public;
grant execute on function get_shipment_documents_tab(uuid) to authenticated;
