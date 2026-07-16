-- ============================================================
-- MODULE 3 — Cross-shipment workspaces (Customs, Delivery Orders,
-- Documents, MOFAIC, Physical Documents — all served by the EXISTING
-- search_shipments RPC with a fixed p_view, no new SQL needed for those
-- five) plus the two genuinely new surfaces this module adds:
--   1. search_exceptions   — cross-shipment Exceptions workspace
--   2. get_report_shipments — the shipment-shaped subset of the
--      prototype's Reports grid (Daily Arrival, Pending, Delayed, Missing
--      Document, Customs Clearance, Municipality/ZDLM Pending, MOFAIC
--      Pending, Net/Gross Weight Variance)
--   3. get_report_supplier_performance — the one report whose shape is
--      genuinely different (aggregated by supplier, not per-shipment)
--
-- Deliberately NOT built here (stated plainly, not silently dropped):
--   - "Audit Activity Report" — folded into Module 4's Audit Log viewer
--     instead of being a second, separate surface over the same table.
--   - "User Workload Report" — needs a workload/assignment model
--     (open items per user) that doesn't exist yet; revisit if FFC asks
--     for it specifically, rather than shipping a thin guess.
--   - "Time Report" — the prototype's REPORTS array lists this name but
--     previewReport() never gave it distinct filter logic (falls through
--     to the generic Ref/Supplier/Origin/Status/ETA/Invoice preview like
--     several other listed names) — there's no real prototype behavior to
--     port, so inventing one here would be a guess dressed as parity.
-- ============================================================

-- ============================================================
-- SEARCH_EXCEPTIONS — cross-shipment exceptions workspace
-- ============================================================
create or replace function search_exceptions(
  p_status text default null,
  p_severity text default null,
  p_page int default 1,
  p_page_size int default 25
) returns table (
  id uuid,
  shipment_id uuid,
  shipment_ref text,
  type_name text,
  severity text,
  description text,
  status text,
  assigned_to_name text,
  due_date date,
  created_at timestamptz,
  resubmission_count bigint,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_view_all boolean;
  v_page int;
  v_page_size int;
  v_offset int;
  v_status text;
  v_severity text;
begin
  v_profile := public.fn_current_profile();

  v_page := greatest(coalesce(p_page, 1), 1);
  v_page_size := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_offset := (v_page - 1) * v_page_size;
  v_status := nullif(trim(coalesce(p_status, '')), '');
  v_severity := nullif(trim(coalesce(p_severity, '')), '');

  if v_status is not null and v_status not in ('Open','Under Review','Waiting for Supplier','Waiting for Carrier','Waiting for Authority','Waiting for Finance','Resolved','Closed') then
    raise exception 'INVALID_STATUS: % is not a recognized exception status', v_status using errcode = '23514';
  end if;
  if v_severity is not null and v_severity not in ('Critical','High','Medium','Low') then
    raise exception 'INVALID_SEVERITY: % is not a recognized severity', v_severity using errcode = '23514';
  end if;

  select allowed into v_view_all from public.role_permissions
    where role = v_profile.role and permission = 'view_all_branches';

  return query
  select
    e.id, e.shipment_id, s.ref as shipment_ref, et.name as type_name, e.severity, e.description, e.status::text,
    pr.full_name as assigned_to_name, e.due_date, e.created_at,
    (select count(*) from public.resubmission_attempts ra where ra.exception_id = e.id) as resubmission_count,
    count(*) over ()::bigint as total_count
  from public.exceptions e
  join public.shipments s on s.id = e.shipment_id
  join public.exception_types et on et.id = e.exception_type_id
  left join public.profiles pr on pr.id = e.assigned_to
  where (coalesce(v_view_all, false) or s.branch_id = v_profile.branch_id)
    and (v_status is null or e.status = v_status::public.exception_status_t)
    and (v_severity is null or e.severity = v_severity)
    and (v_status is not null or e.status not in ('Resolved','Closed'))
  order by
    case e.severity when 'Critical' then 0 when 'High' then 1 when 'Medium' then 2 else 3 end,
    e.created_at desc
  limit v_page_size offset v_offset;
end;
$$;
revoke all on function search_exceptions(text, text, int, int) from public;
grant execute on function search_exceptions(text, text, int, int) to authenticated;

-- ============================================================
-- GET_REPORT_SHIPMENTS — the shipment-shaped reports, one RPC covering
-- all eight so the filter logic lives in one place instead of eight
-- near-identical functions. p_report_key is validated against a fixed
-- allow-list (never interpolated into anything — it only ever drives a
-- CASE branch), so there's no dynamic-SQL surface here at all.
-- ============================================================
create or replace function get_report_shipments(
  p_report_key text,
  p_page int default 1,
  p_page_size int default 100
) returns table (
  id uuid,
  ref text,
  supplier_name_snapshot text,
  origin_country text,
  awb text,
  eta timestamptz,
  overall_status public.overall_status,
  document_status public.document_status,
  customs_status public.customs_status,
  municipality_status public.municipality_status,
  delivery_order_status public.delivery_order_status,
  mofaic_status public.mofaic_status,
  invoice_value numeric,
  currency_code text,
  net_weight numeric,
  gross_weight numeric,
  mofaic_due_date date,
  mofaic_days_left int,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_view_all boolean;
  v_page int;
  v_page_size int;
  v_offset int;
  v_window_days int;
begin
  v_profile := public.fn_current_profile();

  if p_report_key not in (
    'daily_arrivals', 'pending', 'delayed', 'missing_documents',
    'customs_clearance', 'municipality_pending', 'mofaic_pending', 'weight_variance'
  ) then
    raise exception 'INVALID_REPORT_KEY: % is not a recognized report', p_report_key using errcode = '23514';
  end if;

  v_page := greatest(coalesce(p_page, 1), 1);
  v_page_size := least(greatest(coalesce(p_page_size, 100), 1), 500);
  v_offset := (v_page - 1) * v_page_size;

  select allowed into v_view_all from public.role_permissions
    where role = v_profile.role and permission = 'view_all_branches';
  select mr.payment_window_days into v_window_days from public.mofaic_rules mr where mr.id = 1;

  return query
  select
    s.id, s.ref, s.supplier_name_snapshot, co.name as origin_country, s.awb, s.eta,
    s.overall_status, s.document_status, s.customs_status, s.municipality_status,
    s.delivery_order_status, s.mofaic_status,
    (select sum(i.invoice_value) from public.invoices i where i.shipment_id = s.id) as invoice_value,
    (select i.currency_code from public.invoices i where i.shipment_id = s.id limit 1) as currency_code,
    s.net_weight, s.gross_weight,
    case when s.mofaic_status <> 'Not Applicable' and s.delivery_order_received_date is not null and v_window_days is not null
      then s.delivery_order_received_date + v_window_days end as mofaic_due_date,
    case when s.mofaic_status <> 'Not Applicable' and s.delivery_order_received_date is not null and v_window_days is not null
      then (s.delivery_order_received_date + v_window_days) - (now() at time zone 'Asia/Dubai')::date end as mofaic_days_left,
    count(*) over ()::bigint as total_count
  from public.shipments s
  left join public.countries co on co.id = s.origin_country_id
  where (coalesce(v_view_all, false) or s.branch_id = v_profile.branch_id)
    and (
      case p_report_key
        when 'daily_arrivals' then s.eta is not null
          and (s.eta at time zone 'Asia/Dubai')::date = (now() at time zone 'Asia/Dubai')::date
          and s.overall_status <> 'Cancelled'
        when 'pending' then s.overall_status not in ('Completed', 'Cancelled')
        when 'delayed' then s.eta is not null and s.eta < now()
          and s.delivery_order_status <> 'Received'
          and s.overall_status not in ('Draft', 'Cancelled', 'Completed')
        when 'missing_documents' then s.document_status not in ('Complete', 'Verified')
          and s.overall_status not in ('Draft', 'Cancelled')
        when 'customs_clearance' then s.customs_status = 'Declaration Created'
          and s.municipality_status <> 'Finished'
        when 'municipality_pending' then s.municipality_status not in ('Not Required', 'Finished')
          and s.overall_status not in ('Draft', 'Cancelled')
        when 'mofaic_pending' then s.mofaic_status in ('Pending', 'Payment Due', 'Overdue')
        when 'weight_variance' then s.overall_status not in ('Draft', 'Cancelled')
          and s.net_weight is not null and s.gross_weight is not null
        else false
      end
    )
  order by
    case when p_report_key = 'weight_variance' then abs(coalesce(s.gross_weight, 0) - coalesce(s.net_weight, 0)) end desc nulls last,
    case when p_report_key = 'mofaic_pending' then (case when s.mofaic_status <> 'Not Applicable' and s.delivery_order_received_date is not null and v_window_days is not null
      then (s.delivery_order_received_date + v_window_days) - (now() at time zone 'Asia/Dubai')::date end) end asc nulls last,
    s.eta asc nulls last,
    s.created_at desc
  limit v_page_size offset v_offset;
end;
$$;
revoke all on function get_report_shipments(text, int, int) from public;
grant execute on function get_report_shipments(text, int, int) to authenticated;

-- ============================================================
-- GET_REPORT_SUPPLIER_PERFORMANCE — aggregated by supplier, a genuinely
-- different shape from the per-shipment reports above.
-- ============================================================
create or replace function get_report_supplier_performance(
  p_page int default 1,
  p_page_size int default 50
) returns table (
  supplier_name text,
  total_shipments bigint,
  completed_shipments bigint,
  open_exceptions bigint,
  avg_days_to_complete numeric,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_view_all boolean;
  v_page int;
  v_page_size int;
  v_offset int;
begin
  v_profile := public.fn_current_profile();

  v_page := greatest(coalesce(p_page, 1), 1);
  v_page_size := least(greatest(coalesce(p_page_size, 50), 1), 200);
  v_offset := (v_page - 1) * v_page_size;

  select allowed into v_view_all from public.role_permissions
    where role = v_profile.role and permission = 'view_all_branches';

  return query
  select
    s.supplier_name_snapshot as supplier_name,
    count(*)::bigint as total_shipments,
    count(*) filter (where s.overall_status = 'Completed')::bigint as completed_shipments,
    (
      select count(*) from public.exceptions e
      where e.shipment_id in (select id from public.shipments s2 where s2.supplier_name_snapshot = s.supplier_name_snapshot)
        and e.status not in ('Resolved', 'Closed')
    ) as open_exceptions,
    round(avg(extract(epoch from (s.updated_at - s.created_at)) / 86400.0)
      filter (where s.overall_status = 'Completed'), 1) as avg_days_to_complete,
    count(*) over ()::bigint as total_count
  from public.shipments s
  where (coalesce(v_view_all, false) or s.branch_id = v_profile.branch_id)
    and s.overall_status <> 'Cancelled'
  group by s.supplier_name_snapshot
  order by total_shipments desc
  limit v_page_size offset v_offset;
end;
$$;
revoke all on function get_report_supplier_performance(int, int) from public;
grant execute on function get_report_supplier_performance(int, int) to authenticated;
