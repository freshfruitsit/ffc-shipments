-- ============================================================
-- STATUS DEFAULT = "PENDING" — direct, explicit request, confirmed twice.
--
-- An earlier pass (Section I, 20260101000005) already moved
-- municipality/delivery-order/physical-doc defaults away from
-- "Not Required" toward each column's closest real "hasn't started"
-- equivalent, but deliberately left the literal word "Pending" out where
-- the enum didn't already have it, noting "the exact word 'Pending' isn't
-- a valid value for every one of these enums." This migration is what
-- actually adds it, now that's been confirmed as genuinely wanted rather
-- than assumed.
--
-- document_status, customs_status, municipality_status: 'Not Started' is
-- RENAMED to 'Pending' (not added as a second value) — they mean the
-- exact same thing, and having both would just be two words for one
-- state. municipality_status keeps its separate 'Not Required' value
-- untouched — that's a genuinely different state (this shipment category
-- doesn't need municipality clearance at all), not a synonym for pending.
--
-- mofaic_status: default changes from 'Not Applicable' to 'Pending'
-- ('Pending' already exists as a value — no rename needed). Flagging the
-- real trade-off here rather than silently absorbing it: 'Not Applicable'
-- specifically means "this invoice is under the AED 10,000 MOFAIC
-- threshold," which is NOT the same claim as "pending, awaiting action."
-- A brand-new shipment doesn't know its final invoice total yet, so
-- neither default is fully "correct" until an invoice is actually
-- entered — 'Pending' was chosen to match delivery_order_status's
-- existing precedent (also defaults to a state that doesn't apply to
-- every shipment) and the explicit instruction, not because the
-- semantic tension disappeared.
--
-- physical_doc_status: intentionally NOT changed. Its default is already
-- 'Originals Pending', which contains the word "Pending" and is more
-- specific than a bare 'Pending' would be — renaming it would lose real
-- information for no visible gain (the UI already reads "...Pending").
--
-- Existing rows are untouched, same as the earlier pass — this changes
-- what NEW shipments start at, not what already-tracked shipments
-- currently show. Renaming an enum VALUE (not adding one) does correctly
-- update every existing row that already had 'Not Started' stored,
-- though, since the label is what's being renamed, not the underlying
-- value — anything currently showing "Not Started" will now read
-- "Pending" immediately, with no data change at all, just a relabel.
-- ============================================================

alter type document_status rename value 'Not Started' to 'Pending';
alter type customs_status rename value 'Not Started' to 'Pending';
alter type municipality_status rename value 'Not Started' to 'Pending';

alter table shipments alter column mofaic_status set default 'Pending';

-- fn_recalculate_document_status: both branches that assigned 'Not
-- Started' now assign 'Pending' (the enum rename alone doesn't change
-- string literals baked into function bodies — those still need updating
-- explicitly).
create or replace function fn_recalculate_document_status(p_shipment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shipment public.shipments;
  v_required_count int;
  v_present_count int;
  v_verified_count int;
  v_rejected_count int;
  v_any_uploaded boolean;
  v_new_status public.document_status;
begin
  select * into v_shipment from public.shipments where id = p_shipment_id;
  if v_shipment.id is null then
    return;
  end if;

  select count(*) into v_required_count from public.required_documents rd
  where rd.category_id = v_shipment.category_id and rd.is_active
    and (rd.origin_country_id is null or rd.origin_country_id = v_shipment.origin_country_id);

  select count(distinct rd.document_type_id) into v_present_count
  from public.required_documents rd
  join public.documents d on d.document_type_id = rd.document_type_id and d.shipment_id = p_shipment_id
  where rd.category_id = v_shipment.category_id and rd.is_active
    and (rd.origin_country_id is null or rd.origin_country_id = v_shipment.origin_country_id);

  select exists (select 1 from public.documents d where d.shipment_id = p_shipment_id) into v_any_uploaded;

  select count(distinct rd.document_type_id) into v_verified_count
  from public.required_documents rd
  join public.documents d on d.document_type_id = rd.document_type_id and d.shipment_id = p_shipment_id
  join public.document_versions dv on dv.document_id = d.id and dv.is_current and dv.status = 'Verified'
  where rd.category_id = v_shipment.category_id and rd.is_active
    and (rd.origin_country_id is null or rd.origin_country_id = v_shipment.origin_country_id);

  select count(*) into v_rejected_count from public.documents d
  join public.document_versions dv on dv.document_id = d.id and dv.is_current and dv.status = 'Rejected'
  where d.shipment_id = p_shipment_id;

  if v_rejected_count > 0 then v_new_status := 'Rejected';
  elsif v_required_count = 0 then v_new_status := case when v_any_uploaded then 'Complete' else 'Pending' end;
  elsif not v_any_uploaded then v_new_status := 'Pending';
  elsif v_present_count < v_required_count then v_new_status := 'Documents Pending';
  elsif v_verified_count < v_required_count then v_new_status := 'Partially Complete';
  else v_new_status := 'Verified';
  end if;

  update public.shipments set document_status = v_new_status where id = p_shipment_id;
end;
$$;

-- change_shipment_status: the CUSTOMS_NOT_STARTED guard compared against
-- the literal string 'Not Started', which the rename above already
-- retargets at the storage level for the ENUM VALUE itself — but the
-- string literal written directly in this function body is separate text
-- that still needs updating by hand.
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
  v_shipment := public.fn_lock_shipment_for_mutation(p_shipment_id, 'update_status', false);
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

  insert into public.notifications (recipient, title, body, priority, shipment_id, action_url)
  select p.id, 'Shipment status changed', v_shipment.ref || ' moved from ' || v_old_status || ' to ' || p_new_status,
    'Medium', p_shipment_id, '/shipments/' || p_shipment_id || '/overview'
  from public.profiles p
  where p.id = v_shipment.responsible and p.id is distinct from v_profile.id;

  return v_shipment;
end;
$$;
revoke all on function change_shipment_status(uuid, public.overall_status, text) from public;
grant execute on function change_shipment_status(uuid, public.overall_status, text) to authenticated;

-- get_dashboard_metrics: the "Customs declaration pending" alert filter
-- compared against the literal string 'Not Started'.
create or replace function get_dashboard_metrics(p_branch_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_view_all boolean;
  v_branch_filter uuid;
  v_today date;
  v_this_month_start date;
  v_last_month_start date;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null or not v_profile.is_active then
    raise exception 'INACTIVE_OR_MISSING_PROFILE: no active profile for this session' using errcode = '28000';
  end if;

  select rp.allowed into v_view_all from public.role_permissions rp
    where rp.role = v_profile.role and rp.permission = 'view_all_branches';

  v_branch_filter := case
    when coalesce(v_view_all, false) then p_branch_id
    else v_profile.branch_id
  end;

  v_today := (now() at time zone 'Asia/Dubai')::date;
  v_this_month_start := date_trunc('month', v_today)::date;
  v_last_month_start := (date_trunc('month', v_today) - interval '1 month')::date;

  return jsonb_build_object(

    'kpis', (
      select jsonb_build_object(
        'active_shipments', count(*) filter (where s.overall_status <> 'Cancelled'),
        'arriving_today', count(*) filter (where s.eta is not null and (s.eta at time zone 'Asia/Dubai')::date = v_today),
        'arriving_this_week', count(*) filter (
          where s.eta is not null and (s.eta at time zone 'Asia/Dubai')::date between v_today and v_today + 7
        ),
        'documents_pending', count(*) filter (
          where s.document_status not in ('Verified', 'Complete') and s.overall_status <> 'Cancelled'
        ),
        'customs_pending', count(*) filter (
          where s.customs_status not in ('Approved', 'Closed') and s.overall_status not in ('Draft', 'Cancelled')
        ),
        'delivery_orders_pending', count(*) filter (where s.delivery_order_status in ('Pending', 'Requested')),
        'mofaic_pending', count(*) filter (where s.mofaic_status in ('Pending', 'Payment Due', 'Overdue')),
        'physical_docs_pending', count(*) filter (where s.physical_doc_status in ('Originals Pending', 'Ready for Dispatch')),
        'resubmissions', count(*) filter (where s.overall_status = 'Resubmission Required'),
        'ready_for_collection', count(*) filter (where s.overall_status = 'Ready for Collection'),
        'completed_this_month', count(*) filter (
          where s.overall_status = 'Completed' and s.updated_at >= v_this_month_start
        ),
        'completed_last_month', count(*) filter (
          where s.overall_status = 'Completed' and s.updated_at >= v_last_month_start and s.updated_at < v_this_month_start
        ),
        'open_exceptions', (
          select count(*) from public.exceptions e
          join public.shipments s2 on s2.id = e.shipment_id
          where e.status not in ('Resolved', 'Closed')
            and (v_branch_filter is null or s2.branch_id = v_branch_filter)
        )
      )
      from public.shipments s
      where v_branch_filter is null or s.branch_id = v_branch_filter
    ),

    'monthly_volume', (
      select coalesce(jsonb_agg(jsonb_build_object('month_label', to_char(m.month_start, 'Mon'), 'count', coalesce(c.cnt, 0)) order by m.month_start), '[]'::jsonb)
      from (
        select (date_trunc('month', v_today) - (n || ' months')::interval)::date as month_start
        from generate_series(0, 5) as n
      ) m
      left join (
        select date_trunc('month', s.shipment_date)::date as month_start, count(*) as cnt
        from public.shipments s
        where (v_branch_filter is null or s.branch_id = v_branch_filter)
        group by 1
      ) c on c.month_start = m.month_start
    ),

    'status_distribution', (
      select coalesce(jsonb_agg(jsonb_build_object('status', s.overall_status, 'count', cnt) order by cnt desc), '[]'::jsonb)
      from (
        select overall_status, count(*) as cnt from public.shipments
        where v_branch_filter is null or branch_id = v_branch_filter
        group by overall_status
      ) s(overall_status, cnt)
    ),

    'origin_countries', (
      select coalesce(jsonb_agg(jsonb_build_object('label', co.name, 'count', t.cnt) order by t.cnt desc), '[]'::jsonb)
      from (
        select origin_country_id, count(*) as cnt from public.shipments
        where (v_branch_filter is null or branch_id = v_branch_filter) and origin_country_id is not null
        group by origin_country_id order by count(*) desc limit 7
      ) t
      join public.countries co on co.id = t.origin_country_id
    ),

    'arrival_ports', (
      select coalesce(jsonb_agg(jsonb_build_object('label', p.code, 'count', t.cnt) order by t.cnt desc), '[]'::jsonb)
      from (
        select port_id, count(*) as cnt from public.shipments
        where (v_branch_filter is null or branch_id = v_branch_filter) and port_id is not null
        group by port_id
      ) t
      join public.ports p on p.id = t.port_id
    ),

    'suppliers', (
      select coalesce(jsonb_agg(jsonb_build_object('label', t.supplier_name_snapshot, 'count', t.cnt) order by t.cnt desc), '[]'::jsonb)
      from (
        select supplier_name_snapshot, count(*) as cnt from public.shipments
        where v_branch_filter is null or branch_id = v_branch_filter
        group by supplier_name_snapshot order by count(*) desc limit 7
      ) t
    ),

    'processing_time', (
      select jsonb_build_object(
        'docs', round(avg(s.customs_submission_date - s.created_at::date)
          filter (where s.customs_submission_date is not null), 1),
        'customs', round(avg(s.municipality_submission_date - s.customs_submission_date)
          filter (where s.municipality_submission_date is not null and s.customs_submission_date is not null), 1),
        'municipality', round(avg(s.municipality_completion_date - s.municipality_submission_date)
          filter (where s.municipality_completion_date is not null and s.municipality_submission_date is not null), 1),
        'delivery_order', round(avg(s.delivery_order_received_date - s.delivery_order_requested_date)
          filter (where s.delivery_order_received_date is not null and s.delivery_order_requested_date is not null), 1),
        'mofaic', round(avg(s.mofaic_payment_date - s.delivery_order_received_date)
          filter (where s.mofaic_payment_date is not null and s.delivery_order_received_date is not null), 1),
        'dispatch', round(avg(s.delivered_date - s.dispatch_date)
          filter (where s.delivered_date is not null and s.dispatch_date is not null), 1)
      )
      from public.shipments s
      where v_branch_filter is null or s.branch_id = v_branch_filter
    ),

    'on_time_vs_delayed', (
      select jsonb_build_object(
        'on_time', count(*) filter (
          where s.overall_status = 'Completed' and not (s.delivered_date is not null and s.eta is not null and s.delivered_date > s.eta)
        ),
        'delayed', count(*) filter (
          where s.overall_status = 'Completed' and s.delivered_date is not null and s.eta is not null and s.delivered_date > s.eta
        )
      )
      from public.shipments s
      where (v_branch_filter is null or s.branch_id = v_branch_filter) and s.overall_status = 'Completed'
    ),

    'exception_types', (
      select coalesce(jsonb_agg(jsonb_build_object('label', et.name, 'count', t.cnt) order by t.cnt desc), '[]'::jsonb)
      from (
        select e.exception_type_id, count(*) as cnt
        from public.exceptions e
        join public.shipments s on s.id = e.shipment_id
        where e.status not in ('Resolved', 'Closed') and (v_branch_filter is null or s.branch_id = v_branch_filter)
        group by e.exception_type_id
      ) t
      join public.exception_types et on et.id = t.exception_type_id
    ),

    'user_workload', (
      select coalesce(jsonb_agg(jsonb_build_object('label', pr.full_name, 'count', t.cnt) order by t.cnt desc), '[]'::jsonb)
      from (
        select responsible, count(*) as cnt from public.shipments
        where (v_branch_filter is null or branch_id = v_branch_filter)
          and overall_status not in ('Completed', 'Cancelled') and responsible is not null
        group by responsible
      ) t
      join public.profiles pr on pr.id = t.responsible
    ),

    'upcoming_arrivals', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', x.id, 'ref', x.ref, 'supplier', x.supplier_name_snapshot, 'awb', x.awb, 'flight', x.flight,
        'eta', x.eta, 'port', x.port_code, 'responsible_name', x.responsible_name,
        'doc_pct', x.doc_pct, 'overall_status', x.overall_status
      ) order by x.eta), '[]'::jsonb)
      from (
        select
          s.id, s.ref, s.supplier_name_snapshot, s.awb, s.flight, s.eta, s.overall_status,
          p.code as port_code,
          pr.full_name as responsible_name,
          case when req.required_count = 0 then null
            else round(100.0 * coalesce(pres.present_count, 0) / req.required_count)
          end as doc_pct
        from public.shipments s
        left join public.ports p on p.id = s.port_id
        left join public.profiles pr on pr.id = s.responsible
        left join lateral (
          select count(*) as required_count from public.required_documents rd
          where rd.category_id = s.category_id and rd.is_active
            and (rd.origin_country_id is null or rd.origin_country_id = s.origin_country_id)
        ) req on true
        left join lateral (
          select count(distinct rd.document_type_id) as present_count
          from public.required_documents rd
          join public.documents d on d.document_type_id = rd.document_type_id and d.shipment_id = s.id
          join public.document_versions dv on dv.document_id = d.id and dv.is_current
          where rd.category_id = s.category_id and rd.is_active
            and (rd.origin_country_id is null or rd.origin_country_id = s.origin_country_id)
        ) pres on true
        where (v_branch_filter is null or s.branch_id = v_branch_filter)
          and s.eta is not null
          and (s.eta at time zone 'Asia/Dubai')::date between v_today - 1 and v_today + 7
          and s.overall_status <> 'Cancelled'
        order by s.eta
        limit 8
      ) x
    ),

    'attention_required', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'shipment_id', a.shipment_id, 'ref', a.ref, 'text', a.text, 'priority', a.priority
      )), '[]'::jsonb)
      from (
        select shipment_id, ref, text, priority
        from (
          select s.id as shipment_id, s.ref,
            'Missing commercial invoice' as text, 'Critical' as priority
          from public.shipments s
          where (v_branch_filter is null or s.branch_id = v_branch_filter) and s.overall_status <> 'Cancelled'
            and not exists (
              select 1 from public.documents d join public.document_types dt on dt.id = d.document_type_id
              where d.shipment_id = s.id and dt.name = 'Commercial Invoice'
            )
          union all
          select s.id, s.ref, 'AWB missing', 'High'
          from public.shipments s
          where (v_branch_filter is null or s.branch_id = v_branch_filter) and s.overall_status <> 'Cancelled' and s.awb is null
          union all
          select s.id, s.ref, 'Packing list missing', 'High'
          from public.shipments s
          where (v_branch_filter is null or s.branch_id = v_branch_filter) and s.overall_status <> 'Cancelled'
            and not exists (
              select 1 from public.documents d join public.document_types dt on dt.id = d.document_type_id
              where d.shipment_id = s.id and dt.name = 'Packing List'
            )
          union all
          select s.id, s.ref, 'Dubai Customs rejected the declaration', 'Critical'
          from public.shipments s
          where (v_branch_filter is null or s.branch_id = v_branch_filter) and s.customs_status = 'Rejected'
          union all
          select s.id, s.ref, 'Resubmission required', 'High'
          from public.shipments s
          where (v_branch_filter is null or s.branch_id = v_branch_filter) and s.overall_status = 'Resubmission Required'
          union all
          select s.id, s.ref, 'Customs declaration pending', 'Medium'
          from public.shipments s
          where (v_branch_filter is null or s.branch_id = v_branch_filter)
            and s.customs_status in ('Pending', 'Draft') and s.overall_status not in ('Draft', 'Documents Pending')
          union all
          select s.id, s.ref, 'Municipality record pending', 'Medium'
          from public.shipments s
          where (v_branch_filter is null or s.branch_id = v_branch_filter) and s.municipality_status = 'Draft'
          union all
          select s.id, s.ref, 'Delivery order pending', 'Medium'
          from public.shipments s
          where (v_branch_filter is null or s.branch_id = v_branch_filter) and s.delivery_order_status in ('Pending', 'Requested')
          union all
          select s.id, s.ref, 'MOFAIC follow-up pending (' || s.mofaic_status || ')',
            case when s.mofaic_status = 'Overdue' then 'Critical' else 'High' end
          from public.shipments s
          where (v_branch_filter is null or s.branch_id = v_branch_filter)
            and s.mofaic_status in ('Pending', 'Payment Due', 'Overdue')
          union all
          select s.id, s.ref, 'Physical documents not dispatched', 'Medium'
          from public.shipments s
          where (v_branch_filter is null or s.branch_id = v_branch_filter)
            and s.physical_doc_status in ('Originals Pending', 'Ready for Dispatch')
          union all
          select s.id, s.ref, 'ETA passed but shipment not received', 'Critical'
          from public.shipments s
          where (v_branch_filter is null or s.branch_id = v_branch_filter)
            and s.eta is not null and (s.eta at time zone 'Asia/Dubai')::date < v_today
            and s.overall_status not in ('Received', 'Completed', 'Cancelled')
          union all
          select s.id, s.ref, 'Shipment not closed after clearance', 'Medium'
          from public.shipments s
          where (v_branch_filter is null or s.branch_id = v_branch_filter)
            and s.overall_status in ('Ready for Collection', 'Received')
            and s.updated_at < now() - interval '3 days'
        ) all_alerts(shipment_id, ref, text, priority)
        order by case priority when 'Critical' then 0 when 'High' then 1 when 'Medium' then 2 else 3 end, ref
        limit 12
      ) a
    )
  );
end;
$$;
revoke all on function get_dashboard_metrics(uuid) from public;
grant execute on function get_dashboard_metrics(uuid) to authenticated;
