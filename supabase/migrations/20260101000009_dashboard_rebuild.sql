-- ============================================================
-- DASHBOARD REBUILD — replaces the Module 1.1 placeholder version of
-- get_dashboard_metrics with the full set the prototype's dashboard
-- actually showed: all 12 KPI cards, all 9 charts, Upcoming Arrivals, and
-- Attention Required. Ported from the prototype's computeKPIs(),
-- buildCharts(), buildUpcomingArrivals(), and buildAttentionRequired()
-- functions (ffc2/index_final.html) against the REAL schema, not
-- re-guessed from scratch.
--
-- Two deliberate departures from the prototype, both improvements rather
-- than parity — both called out explicitly rather than silently ported:
--
--   1. "Monthly Shipment Volume" was HARDCODED demo data in the prototype
--      (fixed numbers for Feb–Jun, a fake formula for Jul). This version
--      computes real monthly counts from the shipments table.
--   2. "Avg. Processing Time" was likewise entirely hardcoded constants
--      in the prototype. This version computes real average day-counts
--      between the actual milestone timestamps the schema already
--      tracks (customs_submission_date, municipality_submission_date,
--      municipality_completion_date, delivery_order_requested/received_date,
--      mofaic_payment_date, dispatch_date/delivered_date), averaged only
--      over shipments where both endpoints of a given stage are actually
--      populated (nulls don't silently drag the average toward zero).
--
-- Also, "Doc %" in Upcoming Arrivals uses the REAL required_documents
-- config table (category + optional origin-country-specific requirements)
-- rather than the prototype's hardcoded 3-document-type check — the same
-- logic fn_recalculate_document_status already uses, so the percentage
-- shown here is consistent with the shipment's actual document_status.
-- ============================================================

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

    -- Real monthly counts (by shipment_date) for the last 6 calendar months
    -- including the current one, oldest first — replaces the prototype's
    -- hardcoded Feb–Jul numbers.
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

    -- Real average day-counts between milestone timestamps, only over rows
    -- where BOTH endpoints of that specific stage are populated.
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

    -- ETA within [-1, +7] days of today, not Cancelled, soonest first, top 8.
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

    -- The 11 alert rules from the prototype's buildAttentionRequired(),
    -- unioned, sorted by priority, top 12 — same cap, same ordering. The
    -- ORDER BY + LIMIT must happen BEFORE aggregation (in the inner
    -- subquery), not after — a LIMIT on the union directly would just grab
    -- an arbitrary 12 rows in whatever order the planner returns them,
    -- then sort only those; sorting first is what actually gets the
    -- highest-priority 12 across the whole set.
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
            and s.customs_status in ('Not Started', 'Draft') and s.overall_status not in ('Draft', 'Documents Pending')
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
