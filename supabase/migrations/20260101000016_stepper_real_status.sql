-- ============================================================
-- Adds customs_status, municipality_status, delivery_order_status, and
-- created_at to get_shipment_header_context — the stepper at the top of
-- every shipment page only had overall_status, document_status, and
-- physical_doc_status to work with, so it could only ever show a
-- generic "Pending" placeholder for the other stages, even after a user
-- had genuinely updated Customs/Municipality/Delivery Order elsewhere.
-- The stepper itself is updated in the same pass (frontend) to actually
-- use these once they're available — this migration is what makes that
-- possible; overall_status itself is intentionally NOT auto-advanced by
-- this or any subprocess update, since that's a separate, deliberately
-- permission-gated action (change_shipment_status) with its own
-- status_transitions rules that shouldn't be silently bypassed by
-- updating an unrelated field.
-- ============================================================

create or replace function get_shipment_header_context(p_shipment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_view_all boolean;
  v_shipment public.shipments;
  v_result jsonb;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null or not v_profile.is_active then
    raise exception 'INACTIVE_OR_MISSING_PROFILE: no active profile for this session' using errcode = '28000';
  end if;

  select rp.allowed into v_view_all from public.role_permissions rp
    where rp.role = v_profile.role and rp.permission = 'view_all_branches';

  select * into v_shipment from public.shipments where id = p_shipment_id;
  if v_shipment.id is null then
    return null;
  end if;
  if not coalesce(v_view_all, false) and v_shipment.branch_id <> v_profile.branch_id then
    raise exception 'BRANCH_ACCESS_DENIED: this shipment belongs to a different branch' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', v_shipment.id,
    'ref', v_shipment.ref,
    'mode', v_shipment.mode,
    'overall_status', v_shipment.overall_status,
    'priority', v_shipment.priority,
    'supplier_name_snapshot', v_shipment.supplier_name_snapshot,
    'eta', v_shipment.eta,
    'awb', v_shipment.awb,
    'flight', v_shipment.flight,
    'physical_doc_status', v_shipment.physical_doc_status,
    'document_status', v_shipment.document_status,
    'customs_status', v_shipment.customs_status,
    'municipality_status', v_shipment.municipality_status,
    'delivery_order_status', v_shipment.delivery_order_status,
    'created_at', v_shipment.created_at,
    'updated_at', v_shipment.updated_at,
    'completion_eligible', v_shipment.completion_eligible,
    'port_name', (select p.name from public.ports p where p.id = v_shipment.port_id),
    'responsible_name', (select pr.full_name from public.profiles pr where pr.id = v_shipment.responsible),
    'invoice_totals', (
      select coalesce(jsonb_object_agg(currency_code, total), '{}'::jsonb)
      from (
        select currency_code, sum(invoice_value) as total
        from public.invoices where shipment_id = p_shipment_id
        group by currency_code
      ) t
    ),
    'valid_status_transitions', (
      select coalesce(jsonb_agg(jsonb_build_object('to_status', to_status, 'requires_reason', requires_reason)), '[]'::jsonb)
      from public.status_transitions where from_status = v_shipment.overall_status
    ),
    'open_exception_count', (
      select count(*) from public.exceptions where shipment_id = p_shipment_id and status not in ('Resolved', 'Closed')
    ),
    'permissions', jsonb_build_object(
      'assign', coalesce((select allowed from public.role_permissions where role = v_profile.role and permission = 'assign'), false),
      'approve_status_change', coalesce((select allowed from public.role_permissions where role = v_profile.role and permission = 'approve_status_change'), false),
      'manage_exceptions', coalesce((select allowed from public.role_permissions where role = v_profile.role and permission = 'manage_exceptions'), false),
      'edit_basic', coalesce((select allowed from public.role_permissions where role = v_profile.role and permission = 'edit_basic'), false)
    )
  ) into v_result;

  return v_result;
end;
$$;
revoke all on function get_shipment_header_context(uuid) from public;
grant execute on function get_shipment_header_context(uuid) to authenticated;
