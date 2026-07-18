-- ============================================================
-- SINGLE-DOCUMENT UPLOAD MODEL — per direct request, reversing the
-- per-type required-documents checklist just built. Going forward: one
-- shipment, one combined document (all paperwork merged into one file),
-- one Verify tick. Not five separate required types each needing their
-- own file.
--
-- 'Shipment Documents' is added as its own document type — specific and
-- auditable (so a document list clearly says what it is), rather than
-- reusing the generic 'Other' bucket for the primary, expected document
-- on every shipment.
--
-- fn_recalculate_document_status no longer looks at required_documents
-- at all. It now just asks: does this shipment have any document
-- uploaded, and what's the most recent one's current status? The
-- five-required-types logic (present_count/required_count/verified_count
-- against required_documents) is gone — that was exactly right for the
-- checklist model, and is exactly wrong for this one.
--
-- required_documents itself is left untouched — not dropped, just no
-- longer read by this function. If a future need for granular per-type
-- tracking comes back, the data is still there.
-- ============================================================

insert into document_types (name, display_order) values
  ('Shipment Documents', 0)
on conflict (name) do nothing;

create or replace function fn_recalculate_document_status(p_shipment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_latest_status public.doc_version_status;
  v_new_status public.document_status;
begin
  -- Most recent current version across ALL documents on this shipment
  -- (not filtered by type — the whole point now is there's meant to be
  -- just one, but this stays robust even if more than one exists).
  select cv.status into v_latest_status
  from public.documents d
  join public.document_versions cv on cv.document_id = d.id and cv.is_current
  where d.shipment_id = p_shipment_id
  order by cv.uploaded_at desc
  limit 1;

  v_new_status := case
    when v_latest_status is null then 'Pending'
    when v_latest_status = 'Rejected' then 'Rejected'
    when v_latest_status = 'Verified' then 'Verified'
    else 'Documents Pending'  -- uploaded, awaiting verification
  end;

  update public.shipments set document_status = v_new_status where id = p_shipment_id;
end;
$$;
