-- ============================================================
-- BUG FIX — change_shipment_status was broken for every role, not just
-- system_administrator. It was calling fn_lock_shipment_for_mutation
-- with a permission literally named 'update_status' — a permission that
-- was never created anywhere in this schema (see the real list in
-- 20260101000003_reference_data.sql: create_draft, edit_basic,
-- approve_status_change, close_reopen, etc. — 'update_status' isn't
-- among them, and never was). No role could ever have held it, so this
-- check failed unconditionally for everyone.
--
-- This was introduced by mistake in 20260101000011 while rewriting the
-- function for the status-rename migration — a copy/paste placeholder
-- that should never have shipped. The function already has a real,
-- correct, per-transition permission check right after this line
-- (fn_require_permission(v_transition.required_permission), driven by
-- the status_transitions table's own required_permission column, which
-- correctly varies by transition). That check was never broken — this
-- fix just removes the redundant, bogus one in front of it.
-- ============================================================

create or replace function change_shipment_status(
  p_shipment_id uuid, p_new_status public.overall_status, p_reason text default null
) returns public.shipments
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_shipment public.shipments;
  v_transition public.status_transitions;
  v_old_status public.overall_status;
begin
  v_shipment := public.fn_lock_shipment_for_mutation(p_shipment_id, null, false);
  v_old_status := v_shipment.overall_status;

  select * into v_transition from public.status_transitions st
  where st.from_status = v_old_status and st.to_status = p_new_status;

  if v_transition.from_status is null then
    raise exception 'INVALID_TRANSITION: % -> % is not an allowed status transition', v_old_status, p_new_status
      using errcode = '23514';
  end if;

  v_profile := public.fn_require_permission(v_transition.required_permission);

  if v_transition.requires_reason and (p_reason is null or length(trim(p_reason)) = 0) then
    raise exception 'REASON_REQUIRED: a reason is required for this status change' using errcode = '23502';
  end if;

  if p_new_status = 'Ready for Submission' and v_shipment.document_status not in ('Complete','Verified') then
    raise exception 'DOCUMENTS_NOT_READY: document_status must be Complete or Verified before Ready for Submission (currently %)', v_shipment.document_status using errcode = '23514';
  end if;
  if p_new_status = 'Submitted' and v_shipment.customs_status = 'Pending' then
    raise exception 'CUSTOMS_NOT_STARTED: customs processing must have begun before Submitted' using errcode = '23514';
  end if;
  if p_new_status = 'Received' and v_shipment.delivery_order_status = 'Pending' then
    raise exception 'DELIVERY_ORDER_NOT_READY: delivery order must progress past Pending before Received' using errcode = '23514';
  end if;

  update public.shipments set
    overall_status = p_new_status,
    updated_by = v_profile.id
  where id = p_shipment_id
  returning * into v_shipment;

  perform public.fn_set_audit_context('Status changed: ' || v_old_status || ' -> ' || p_new_status ||
    case when p_reason is not null then ' (' || p_reason || ')' else '' end);

  insert into public.notifications (recipient, shipment_id, event_type, title, message, priority, link_target)
  select p.id, p_shipment_id, 'status_change', 'Shipment status changed',
    v_shipment.ref || ' moved from ' || v_old_status || ' to ' || p_new_status,
    'Medium', '/shipments/' || p_shipment_id || '/overview'
  from public.profiles p
  where p.id = v_shipment.responsible and p.id is distinct from v_profile.id;

  return v_shipment;
end;
$$;
revoke all on function change_shipment_status(uuid, public.overall_status, text) from public;
grant execute on function change_shipment_status(uuid, public.overall_status, text) to authenticated;
