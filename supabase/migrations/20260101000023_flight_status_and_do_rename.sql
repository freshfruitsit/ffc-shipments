-- ============================================================
-- AIR SHIPMENT TEAM REQUESTS (from a real stakeholder meeting):
--
--   1. Flight status tracking — Booked, Manifested, Departed, Delayed,
--      In Transit (with a free-text transit airport, confirmed directly
--      — our own ports table only has FFC's 4 Dubai-area arrival
--      airports, not a global airport list), Cancelled.
--
--   2. Delivery Order's existing 'Received' status is renamed to
--      'Received from Carrier' for clarity — confirmed this is the SAME
--      concept already tracked, just needed a clearer label, not a new
--      field. "Documents Received in FFC Office" is likewise confirmed
--      to already be the Physical Documents tab's existing "Originals
--      Received" field — no new field needed there either.
--
-- Renaming an enum VALUE (not adding one) retroactively relabels every
-- existing row that already had 'Received' stored — same as every prior
-- rename in this project, no data migration needed separately.
-- ============================================================

create type flight_status as enum ('Booked', 'Manifested', 'Departed', 'Delayed', 'In Transit', 'Cancelled');

alter table shipments add column flight_status flight_status not null default 'Booked';
alter table shipments add column transit_airport text;

alter type delivery_order_status rename value 'Received' to 'Received from Carrier';

-- ---------- Delivery Order auto-date trigger ----------
create or replace function fn_delivery_order_received_date()
returns trigger language plpgsql as $$
begin
  if new.delivery_order_status = 'Received from Carrier' and new.delivery_order_received_date is null then
    new.delivery_order_received_date := current_date;
  end if;
  return new;
end;
$$;

-- ---------- update_delivery_order ----------
create or replace function update_delivery_order(
  p_shipment_id uuid, p_carrier_id uuid, p_delivery_order_status public.delivery_order_status,
  p_delivery_order_requested_date date, p_delivery_order_received_date date,
  p_delivery_order_doc_uploaded boolean, p_delivery_order_responsible uuid, p_delivery_order_remarks text
) returns public.shipments
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_shipment public.shipments;
  v_received_date date;
begin
  v_shipment := public.fn_lock_shipment_for_mutation(p_shipment_id, 'edit_delivery_order');
  v_profile := public.fn_current_profile();
  perform public.fn_require_assignable_profile(p_delivery_order_responsible, v_shipment.branch_id, 'edit_delivery_order');
  if p_delivery_order_status = 'Verified' and not coalesce(p_delivery_order_doc_uploaded, false) then
    raise exception 'DELIVERY_ORDER_DOC_MISSING: delivery order cannot be Verified without doc_uploaded = true' using errcode = '23514';
  end if;

  v_received_date := p_delivery_order_received_date;
  if p_delivery_order_status = 'Received from Carrier' and v_received_date is null then
    v_received_date := current_date;
  end if;

  update public.shipments set
    carrier_id = p_carrier_id, delivery_order_status = p_delivery_order_status,
    delivery_order_requested_date = p_delivery_order_requested_date, delivery_order_received_date = v_received_date,
    delivery_order_doc_uploaded = p_delivery_order_doc_uploaded, delivery_order_responsible = p_delivery_order_responsible,
    delivery_order_remarks = p_delivery_order_remarks, updated_by = v_profile.id
  where id = p_shipment_id returning * into v_shipment;

  return v_shipment;
end;
$$;

-- ---------- get_report_shipments (the 'delayed' filter referenced the old label) ----------
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
          and s.delivery_order_status <> 'Received from Carrier'
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

-- ---------- update_shipment_transport (adds flight_status + transit_airport) ----------
create or replace function update_shipment_transport(
  p_shipment_id uuid, p_awb text, p_airline_id uuid, p_flight text, p_eta timestamptz,
  p_port_id uuid, p_freight_agent_id uuid, p_clearing_agent_id uuid, p_packages int,
  p_net_weight numeric, p_gross_weight numeric, p_transport_remarks text,
  p_flight_status public.flight_status default 'Booked', p_transit_airport text default null
) returns public.shipments
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_shipment public.shipments;
  v_duplicate_awb text;
begin
  v_shipment := public.fn_lock_shipment_for_mutation(p_shipment_id, 'edit_transport');
  v_profile := public.fn_current_profile();
  if p_net_weight is not null and p_gross_weight is not null and p_net_weight > p_gross_weight then
    raise exception 'INVALID_WEIGHTS: net weight (%) cannot exceed gross weight (%)', p_net_weight, p_gross_weight using errcode = '23514';
  end if;
  if p_packages is not null and p_packages < 0 then
    raise exception 'INVALID_PACKAGES: package count cannot be negative' using errcode = '23514';
  end if;
  if p_net_weight is not null and p_net_weight < 0 then
    raise exception 'INVALID_WEIGHTS: net weight cannot be negative' using errcode = '23514';
  end if;
  if p_gross_weight is not null and p_gross_weight < 0 then
    raise exception 'INVALID_WEIGHTS: gross weight cannot be negative' using errcode = '23514';
  end if;
  if p_flight_status = 'In Transit' and (p_transit_airport is null or length(trim(p_transit_airport)) = 0) then
    raise exception 'TRANSIT_AIRPORT_REQUIRED: transit airport is required when flight status is In Transit' using errcode = '23514';
  end if;

  if p_awb is not null then
    select ref into v_duplicate_awb from public.shipments where awb = p_awb and id <> p_shipment_id limit 1;
    if v_duplicate_awb is not null then
      insert into public.exceptions (shipment_id, exception_type_id, severity, description, raised_by, status)
      select p_shipment_id, et.id, 'Medium', 'AWB ' || p_awb || ' also appears on shipment ' || v_duplicate_awb, v_profile.id, 'Open'
      from public.exception_types et where et.name = 'Duplicate AWB' limit 1;
    end if;
  end if;

  update public.shipments set
    awb = p_awb, airline_id = p_airline_id, flight = p_flight, eta = p_eta, port_id = p_port_id,
    freight_agent_id = p_freight_agent_id, clearing_agent_id = p_clearing_agent_id, packages = p_packages,
    net_weight = p_net_weight, gross_weight = p_gross_weight, transport_remarks = p_transport_remarks,
    flight_status = p_flight_status,
    -- Only stores a transit airport when the status actually calls for
    -- one — avoids a stale leftover value confusingly persisting once the
    -- flight moves on to Departed/Delayed/etc.
    transit_airport = case when p_flight_status = 'In Transit' then p_transit_airport else null end,
    updated_by = v_profile.id
  where id = p_shipment_id returning * into v_shipment;

  return v_shipment;
end;
$$;
-- create or replace with 2 ADDED parameters creates a new overload
-- alongside the old one (Postgres function identity is the full
-- parameter type list) — the old 12-parameter version needs an explicit
-- drop, or both would coexist.
drop function if exists update_shipment_transport(uuid,text,uuid,text,timestamptz,uuid,uuid,uuid,int,numeric,numeric,text);
revoke all on function update_shipment_transport(uuid,text,uuid,text,timestamptz,uuid,uuid,uuid,int,numeric,numeric,text,public.flight_status,text) from public;
grant execute on function update_shipment_transport(uuid,text,uuid,text,timestamptz,uuid,uuid,uuid,int,numeric,numeric,text,public.flight_status,text) to authenticated;

-- ---------- get_shipment_transport_tab (returns flight_status + transit_airport) ----------
create or replace function get_shipment_transport_tab(p_shipment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_shipment public.shipments;
  v_profile public.profiles;
begin
  v_shipment := public.fn_require_shipment_access(p_shipment_id, null);
  select * into v_profile from public.profiles pr where pr.id = auth.uid();

  return jsonb_build_object(
    'ref', v_shipment.ref,
    'awb', v_shipment.awb,
    'airline_id', v_shipment.airline_id,
    'airline_name', (select a.name from public.airlines a where a.id = v_shipment.airline_id),
    'flight', v_shipment.flight,
    'flight_status', v_shipment.flight_status,
    'transit_airport', v_shipment.transit_airport,
    'eta', v_shipment.eta,
    'port_id', v_shipment.port_id,
    'port_name', (select p.name from public.ports p where p.id = v_shipment.port_id),
    'freight_agent_id', v_shipment.freight_agent_id,
    'freight_agent_name', (select fa.name from public.freight_agents fa where fa.id = v_shipment.freight_agent_id),
    'clearing_agent_id', v_shipment.clearing_agent_id,
    'clearing_agent_name', (select ca.name from public.clearing_agents ca where ca.id = v_shipment.clearing_agent_id),
    'packages', v_shipment.packages,
    'net_weight', v_shipment.net_weight,
    'gross_weight', v_shipment.gross_weight,
    'transport_remarks', v_shipment.transport_remarks,
    'can_edit', public.fn_permission_for(v_profile.role, 'edit_transport') and v_shipment.overall_status <> 'Completed'
  );
end;
$$;
revoke all on function get_shipment_transport_tab(uuid) from public;
grant execute on function get_shipment_transport_tab(uuid) to authenticated;
