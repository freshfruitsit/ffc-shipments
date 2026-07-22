-- ============================================================
-- MAJOR REDESIGN — automatic status progression, replacing manual
-- Change Status / Complete Shipment entirely. overall_status becomes a
-- DERIVED field, computed from the 6 module statuses whenever any of
-- them changes (or transport/invoice completeness, for the first
-- stage), rather than something a person sets directly.
--
-- Three enum types are genuinely REPLACED (not just extended):
--   customs_status:      Pending, Draft, Submitted, Finished
--   municipality_status: Not Required, Pending, Draft, Submitted, Finished
--   overall_status:      Created, Dubai Customs, Delivery Order Received,
--                         Dubai Municipality, Documents at FFC HO,
--                         MOFAIC Completed, Physical Documents Dispatched,
--                         Completed
--
-- On Hold / Cancelled / Rejected are gone from overall_status entirely —
-- per direct instruction, those now go through the existing Exceptions
-- feature instead of being a stepper position.
--
-- ORDERING MATTERS HERE. Postgres tracks type dependencies by OID, not
-- name — renaming a type doesn't break functions that use it, but they
-- keep using the OLD (renamed-away) definition until explicitly
-- recreated. So every function with one of these types in its own
-- signature or RETURN TABLE must be recreated (picking up the NEW type
-- under the original name) BEFORE the old type can be dropped, or the
-- drop fails on a dependency error. Sequence: rename+create new types →
-- swap the shipments columns → recreate every dependent function → drop
-- the old types last.
-- ============================================================

-- ---------- 0. Drop every trigger that depends on these columns first ----------
-- Column-specific triggers (UPDATE OF <columns>) block dropping those
-- columns entirely while they exist, regardless of type renames. All
-- three get dropped here, before any type/column work begins.
--
-- trg_completion_eligibility gets fully replaced below by
-- trg_recalculate_progress. trg_notify_completion_eligible gets
-- recreated below with an updated message (it used to say "review and
-- confirm completion" — there's no more manual confirm step now that
-- completion is automatic). trg_notify_status_events is dropped
-- entirely and NOT recreated: it fired on customs_status = 'Rejected'
-- and overall_status = 'Resubmission Required', neither of which can
-- ever occur again — both are tracked through Exceptions now, which has
-- its own notification path already.
drop trigger if exists trg_completion_eligibility on shipments;
drop trigger if exists trg_notify_completion_eligible on shipments;
drop trigger if exists trg_notify_status_events on shipments;
drop function if exists fn_notify_status_events();

-- ---------- 1. Swap the three enum types on shipments ----------

alter type customs_status rename to customs_status_old;
create type customs_status as enum ('Pending', 'Draft', 'Submitted', 'Finished');
alter table shipments add column customs_status_new customs_status;
update shipments set customs_status_new = case customs_status::text
  when 'Pending' then 'Pending'
  when 'Draft' then 'Draft'
  when 'Request Created' then 'Draft'
  when 'Submitted' then 'Submitted'
  when 'Declaration Created' then 'Submitted'
  when 'Under Review' then 'Submitted'
  when 'Rejected' then 'Submitted'
  when 'Resubmission Required' then 'Submitted'
  when 'Approved' then 'Finished'
  when 'Closed' then 'Finished'
  else 'Pending'
end::customs_status;
alter table shipments alter column customs_status_new set not null;
alter table shipments alter column customs_status_new set default 'Pending';
alter table shipments drop column customs_status;
alter table shipments rename column customs_status_new to customs_status;

alter type municipality_status rename to municipality_status_old;
create type municipality_status as enum ('Not Required', 'Pending', 'Draft', 'Submitted', 'Finished');
alter table shipments add column municipality_status_new municipality_status;
update shipments set municipality_status_new = case municipality_status::text
  when 'Not Required' then 'Not Required'
  when 'Pending' then 'Pending'
  when 'Draft' then 'Draft'
  when 'Submitted' then 'Submitted'
  when 'Under Review' then 'Submitted'
  when 'Rejected' then 'Submitted'
  when 'Resubmission Required' then 'Submitted'
  when 'Finished' then 'Finished'
  else 'Pending'
end::municipality_status;
alter table shipments alter column municipality_status_new set not null;
alter table shipments alter column municipality_status_new set default 'Pending';
alter table shipments drop column municipality_status;
alter table shipments rename column municipality_status_new to municipality_status;

-- Every row gets a provisional value here (Completed preserved as-is,
-- everything else provisionally 'Created') — the one-time recalculation
-- pass at the very end of this migration immediately corrects every row
-- to its real current stage based on actual module statuses.
alter type overall_status rename to overall_status_old;
create type overall_status as enum (
  'Created', 'Dubai Customs', 'Delivery Order Received', 'Dubai Municipality',
  'Documents at FFC HO', 'MOFAIC Completed', 'Physical Documents Dispatched', 'Completed'
);
alter table shipments add column overall_status_new overall_status;
update shipments set overall_status_new = case overall_status::text
  when 'Completed' then 'Completed'
  else 'Created'
end::overall_status;
alter table shipments alter column overall_status_new set not null;
alter table shipments alter column overall_status_new set default 'Created';
alter table shipments drop column overall_status;
alter table shipments rename column overall_status_new to overall_status;

-- ---------- 2. Drop the manual status-change mechanism entirely ----------
-- These referenced overall_status directly in their own signature —
-- dropping them now, before the old type goes away, removes that
-- dependency. Both are fully replaced by automatic derivation below.
drop function if exists change_shipment_status(uuid, overall_status_old, text);
drop function if exists confirm_shipment_completion(uuid, text);

-- ---------- 3. update_customs — fix the hardcoded value check ----------
-- The old-typed overload (parameter typed as the now-renamed
-- customs_status_old) still exists alongside whatever create or replace
-- creates next — different parameter types make this a new overload,
-- not a replacement, same issue as update_shipment_transport hit
-- earlier in this project. Drop it explicitly or it blocks dropping the
-- old type later.
drop function if exists update_customs(uuid, text, customs_status_old, date, text, text);
create or replace function update_customs(
  p_shipment_id uuid, p_declaration_no text, p_customs_status public.customs_status,
  p_customs_submission_date date, p_customs_result text, p_customs_remarks text
) returns public.shipments
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_shipment public.shipments;
begin
  v_shipment := public.fn_lock_shipment_for_mutation(p_shipment_id, 'edit_customs');
  v_profile := public.fn_current_profile();
  if p_customs_status in ('Submitted', 'Finished') and (p_declaration_no is null or length(trim(p_declaration_no)) = 0) then
    raise exception 'DECLARATION_NUMBER_REQUIRED: a declaration number is required once status reaches %', p_customs_status using errcode = '23502';
  end if;
  if p_customs_submission_date is not null and p_customs_submission_date > current_date then
    raise exception 'INVALID_DATE: customs submission date cannot be in the future' using errcode = '23514';
  end if;

  update public.shipments set
    declaration_no = p_declaration_no, customs_status = p_customs_status,
    customs_submission_date = p_customs_submission_date, customs_result = p_customs_result,
    customs_remarks = p_customs_remarks, updated_by = v_profile.id
  where id = p_shipment_id returning * into v_shipment;

  return v_shipment;
end;
$$;
revoke all on function update_customs(uuid,text,public.customs_status,date,text,text) from public;
grant execute on function update_customs(uuid,text,public.customs_status,date,text,text) to authenticated;

-- update_municipality had no hardcoded value checks — recreated only so
-- its signature picks up the new municipality_status type.
-- Same overload issue as update_customs above.
drop function if exists update_municipality(uuid, text, text, municipality_status_old, date, date, text);
create or replace function update_municipality(
  p_shipment_id uuid, p_municipality_draft_ref text, p_municipality_submitted_ref text,
  p_municipality_status public.municipality_status, p_municipality_submission_date date,
  p_municipality_completion_date date, p_municipality_remarks text
) returns public.shipments
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_shipment public.shipments;
begin
  v_shipment := public.fn_lock_shipment_for_mutation(p_shipment_id, 'edit_customs');
  v_profile := public.fn_current_profile();
  if p_municipality_submitted_ref is not null and p_municipality_draft_ref is null then
    raise exception 'MUNICIPALITY_SEQUENCE: a submitted reference requires a draft reference first' using errcode = '23514';
  end if;
  if p_municipality_completion_date is not null and p_municipality_submission_date is not null
     and p_municipality_completion_date < p_municipality_submission_date then
    raise exception 'INVALID_DATE_ORDER: completion date cannot be before submission date' using errcode = '23514';
  end if;

  update public.shipments set
    municipality_draft_ref = p_municipality_draft_ref, municipality_submitted_ref = p_municipality_submitted_ref,
    municipality_status = p_municipality_status, municipality_submission_date = p_municipality_submission_date,
    municipality_completion_date = p_municipality_completion_date, municipality_remarks = p_municipality_remarks,
    updated_by = v_profile.id
  where id = p_shipment_id returning * into v_shipment;

  return v_shipment;
end;
$$;
revoke all on function update_municipality(uuid,text,text,public.municipality_status,date,date,text) from public;
grant execute on function update_municipality(uuid,text,text,public.municipality_status,date,date,text) to authenticated;

-- ---------- 4. The new auto-derivation engine ----------
-- Replaces fn_check_completion_eligibility entirely. Same safety checks
-- (blocking exceptions, pending resubmissions) preserved exactly as
-- before — only now it ALSO derives overall_status itself, checked from
-- the most-advanced condition backward, so a shipment always shows the
-- furthest point it has genuinely, currently reached.
create or replace function fn_recalculate_shipment_progress()
returns trigger language plpgsql
security definer
set search_path = ''
as $$
declare
  v_has_blocking_exception boolean;
  v_has_pending_resubmission boolean;
  v_customs_finished boolean;
  v_delivery_order_received boolean;
  v_municipality_finished boolean;
  v_mofaic_resolved boolean;
  v_physical_dispatched boolean;
  v_completion_eligible boolean;
begin
  select exists (
    select 1 from public.exceptions
    where shipment_id = new.id
      and severity in ('Critical','High')
      and status not in ('Resolved','Closed')
  ) into v_has_blocking_exception;

  select exists (
    select 1 from public.resubmission_attempts ra
    join public.exceptions e on e.id = ra.exception_id
    where e.shipment_id = new.id
      and ra.authority_result = 'Pending'
  ) into v_has_pending_resubmission;

  -- "Created" (the floor stage) doesn't need its own sub-state tracked
  -- here — whether Basic Info/Transport/Invoices are actually complete
  -- is a genuinely useful thing to SHOW (e.g. "2 of 3 done" under the
  -- Created stepper stage), but that's a display concern the frontend
  -- can compute directly from the shipment's own raw fields (awb,
  -- airline_id, flight, eta, port_id) and an invoice-existence check,
  -- without needing derived columns just for a sub-state within a
  -- single stage. Nothing about stage progression past Created depends
  -- on it either way — the next real stage (Dubai Customs) only depends
  -- on customs_status itself.

  v_customs_finished := new.customs_status = 'Finished';
  v_delivery_order_received := new.delivery_order_status in ('Received from Carrier', 'Uploaded', 'Verified');
  v_municipality_finished := new.municipality_status in ('Not Required', 'Finished');
  v_mofaic_resolved := new.mofaic_status in ('Not Applicable', 'Completed', 'Paid');
  v_physical_dispatched := new.physical_doc_status in ('Not Required', 'Dispatched', 'In Transit', 'Delivered', 'Proof of Delivery Received', 'Closed');

  v_completion_eligible :=
    new.document_status in ('Complete', 'Verified')
    and v_customs_finished
    and v_municipality_finished
    and new.delivery_order_status in ('Not Required', 'Verified')
    and v_mofaic_resolved
    and new.physical_doc_status in ('Not Required', 'Closed', 'Proof of Delivery Received')
    and not v_has_blocking_exception
    and not v_has_pending_resubmission;

  new.completion_eligible := v_completion_eligible;

  new.overall_status := case
    when v_completion_eligible then 'Completed'
    when v_physical_dispatched then 'Physical Documents Dispatched'
    when v_mofaic_resolved then 'MOFAIC Completed'
    when new.originals_received then 'Documents at FFC HO'
    when v_municipality_finished then 'Dubai Municipality'
    when v_delivery_order_received then 'Delivery Order Received'
    when v_customs_finished then 'Dubai Customs'
    else 'Created'
  end;

  return new;
end;
$$;
revoke all on function fn_recalculate_shipment_progress() from public;

drop trigger if exists trg_recalculate_progress on shipments;
create trigger trg_recalculate_progress
  before insert or update of document_status, customs_status, municipality_status,
                             delivery_order_status, mofaic_status, physical_doc_status,
                             originals_received, awb, airline_id, flight, eta, port_id
  on shipments
  for each row execute function fn_recalculate_shipment_progress();

-- fn_notify_completion_eligible recreated with an updated message — it
-- used to say "review and confirm completion," which no longer applies
-- now that completion happens automatically the moment eligibility is
-- reached, with no manual confirm step. Same trigger condition as
-- before (fires only on the moment completion_eligible newly becomes
-- true), just an honest notification body for what actually happens now.
create or replace function fn_notify_completion_eligible()
returns trigger language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.completion_eligible and not coalesce(old.completion_eligible, false) then
    insert into public.notifications (recipient, shipment_id, event_type, title, message, priority, dedup_key)
    select p.id, new.id, 'completion_eligible',
           'Completed: ' || new.ref,
           new.ref || ' has been automatically marked Completed — every tracked sub-process finished.',
           'Medium',
           'completion_eligible:' || new.id
    from (select new.responsible as id union select new.coordinator) p
    where p.id is not null
    on conflict (dedup_key) where dedup_key is not null do nothing;
  end if;
  return new;
end;
$$;
revoke all on function fn_notify_completion_eligible() from public;
drop trigger if exists trg_notify_completion_eligible on shipments;
create trigger trg_notify_completion_eligible
  after update of document_status, customs_status, municipality_status,
                    delivery_order_status, mofaic_status, physical_doc_status,
                    overall_status
  on shipments
  for each row execute function fn_notify_completion_eligible();

-- Note: an earlier version of this migration also added a trigger on
-- invoices to force a recalculation when the first/last invoice was
-- added or removed, on the assumption "Created" would depend on invoice
-- existence. That dependency was removed above (see the comment on why
-- Created's sub-state is a frontend display concern, not something the
-- derivation engine itself tracks) — so nothing in the final logic
-- checks invoices at all anymore, making that trigger genuinely
-- pointless. Removed rather than left in as harmless-but-dead code.

-- ---------- 5. One-time recalculation of every existing shipment ----------
-- Every row currently sits at the crude enum-swap placeholder (Completed
-- preserved, everything else 'Created') — this touches the trigger's
-- watched column on every row, so trg_recalculate_progress immediately
-- recomputes each one's real, current overall_status and
-- completion_eligible from its actual module statuses.
update shipments set document_status = document_status;

-- ---------- 6. search_shipments — new types + fixed workspace views ----------
-- RETURNS TABLE structures containing these enum types count as
-- structurally different now (new type objects, even reusing the same
-- names) — CREATE OR REPLACE can't handle that for a RETURNS TABLE
-- function, an explicit drop is required first.
drop function if exists search_shipments(text, overall_status_old, text, int, int);
create or replace function search_shipments(
  p_query text default null,
  p_status public.overall_status default null,
  p_view text default null,
  p_page int default 1,
  p_page_size int default 25
) returns table (
  id uuid,
  ref text,
  supplier_name_snapshot text,
  origin_country text,
  awb text,
  eta timestamptz,
  port text,
  shipment_date date,
  overall_status public.overall_status,
  document_status public.document_status,
  customs_status public.customs_status,
  municipality_status public.municipality_status,
  delivery_order_status public.delivery_order_status,
  mofaic_status public.mofaic_status,
  physical_doc_status public.physical_doc_status,
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
  v_query text;
  v_view text;
begin
  v_profile := public.fn_current_profile();

  if p_query is not null and length(p_query) > 100 then
    raise exception 'QUERY_TOO_LONG: search text cannot exceed 100 characters' using errcode = '23514';
  end if;

  v_page := greatest(coalesce(p_page, 1), 1);
  v_page_size := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_offset := (v_page - 1) * v_page_size;
  v_query := nullif(trim(coalesce(p_query, '')), '');
  v_view := coalesce(nullif(trim(p_view), ''), 'all');

  select allowed into v_view_all from public.role_permissions
    where role = v_profile.role and permission = 'view_all_branches';

  return query
  select
    s.id, s.ref, s.supplier_name_snapshot, co.name as origin_country, s.awb, s.eta, po.name as port,
    s.shipment_date, s.overall_status, s.document_status, s.customs_status, s.municipality_status,
    s.delivery_order_status, s.mofaic_status, s.physical_doc_status,
    count(*) over ()::bigint as total_count
  from public.shipments s
  left join public.countries co on co.id = s.origin_country_id
  left join public.ports po on po.id = s.port_id
  where (coalesce(v_view_all, false) or s.branch_id = v_profile.branch_id)
    and (p_status is null or s.overall_status = p_status)
    and (
      v_query is null
      or s.ref ilike '%' || v_query || '%'
      or s.awb ilike '%' || v_query || '%'
      or s.supplier_name_snapshot ilike '%' || v_query || '%'
      or exists (
        select 1 from public.invoices i where i.shipment_id = s.id and i.invoice_no ilike '%' || v_query || '%'
      )
    )
    and (
      case v_view
        -- 'Draft'/'Cancelled' no longer exist as overall_status values —
        -- every shipment now genuinely belongs in the register, there's
        -- no longer a separate "not really a real shipment yet" state to
        -- exclude.
        when 'all' then true
        when 'mine' then s.responsible = v_profile.id
        when 'today' then s.eta is not null and (s.eta at time zone 'Asia/Dubai')::date = (now() at time zone 'Asia/Dubai')::date
        when 'week' then s.eta is not null
          and (s.eta at time zone 'Asia/Dubai')::date >= (now() at time zone 'Asia/Dubai')::date
          and (s.eta at time zone 'Asia/Dubai')::date <= (now() at time zone 'Asia/Dubai')::date + 7
        when 'missingdocs' then s.document_status not in ('Verified','Complete')
        when 'custpending' then s.customs_status <> 'Finished'
        when 'munipending' then s.municipality_status not in ('Not Required','Finished')
        when 'dopending' then s.delivery_order_status in ('Pending','Requested')
        when 'mofaicpending' then s.mofaic_status in ('Pending','Payment Due','Overdue')
        when 'physpending' then s.physical_doc_status in ('Pending','Ready for Dispatch')
        when 'exceptions' then exists (
          select 1 from public.exceptions e where e.shipment_id = s.id and e.status not in ('Resolved','Closed')
        )
        -- 'resub' used to check overall_status = 'Resubmission Required',
        -- which no longer exists — resubmissions are tracked through
        -- Exceptions now, so this checks for a genuinely pending one there.
        when 'resub' then exists (
          select 1 from public.resubmission_attempts ra
          join public.exceptions e on e.id = ra.exception_id
          where e.shipment_id = s.id and ra.authority_result = 'Pending'
        )
        -- 'collection' used to check overall_status = 'Ready for
        -- Collection', which had no equivalent in the old model either
        -- once things were cleared — closest current equivalent is
        -- Municipality just having finished (cleared, not yet physically
        -- received back at FFC).
        when 'collection' then s.overall_status = 'Dubai Municipality'
        when 'completed' then s.overall_status = 'Completed'
          and date_trunc('month', s.updated_at at time zone 'Asia/Dubai') = date_trunc('month', now() at time zone 'Asia/Dubai')
        else true
      end
    )
  order by s.created_at desc
  limit v_page_size offset v_offset;
end;
$$;
revoke all on function search_shipments(text, public.overall_status, text, int, int) from public;
grant execute on function search_shipments(text, public.overall_status, text, int, int) to authenticated;

-- ---------- 7. get_report_shipments — new types + fixed report filters ----------
-- Same structural-return-type issue as search_shipments above.
drop function if exists get_report_shipments(text, int, int);
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
        -- 'Draft'/'Cancelled' no longer exist as overall_status values —
        -- every shipment is now a genuine, live shipment from creation.
        when 'daily_arrivals' then s.eta is not null
          and (s.eta at time zone 'Asia/Dubai')::date = (now() at time zone 'Asia/Dubai')::date
        when 'pending' then s.overall_status <> 'Completed'
        when 'delayed' then s.eta is not null and s.eta < now()
          and s.delivery_order_status <> 'Received from Carrier'
          and s.overall_status <> 'Completed'
        when 'missing_documents' then s.document_status not in ('Complete', 'Verified')
        -- 'Declaration Created' no longer exists — closest equivalent in
        -- the simplified enum is 'Submitted' (actively being processed,
        -- not yet Finished).
        when 'customs_clearance' then s.customs_status = 'Submitted'
          and s.municipality_status <> 'Finished'
        when 'municipality_pending' then s.municipality_status not in ('Not Required', 'Finished')
        when 'mofaic_pending' then s.mofaic_status in ('Pending', 'Payment Due', 'Overdue')
        when 'weight_variance' then s.net_weight is not null and s.gross_weight is not null
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

-- ---------- 8. get_dashboard_metrics — fixed throughout ----------
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
        -- 'Draft'/'Cancelled' no longer exist as overall_status values —
        -- every shipment is a real, active one from creation, so this is
        -- now simply every shipment in scope.
        'active_shipments', count(*),
        'arriving_today', count(*) filter (where s.eta is not null and (s.eta at time zone 'Asia/Dubai')::date = v_today),
        'arriving_this_week', count(*) filter (
          where s.eta is not null and (s.eta at time zone 'Asia/Dubai')::date between v_today and v_today + 7
        ),
        'documents_pending', count(*) filter (where s.document_status not in ('Verified', 'Complete')),
        'customs_pending', count(*) filter (where s.customs_status <> 'Finished'),
        'delivery_orders_pending', count(*) filter (where s.delivery_order_status in ('Pending', 'Requested')),
        'mofaic_pending', count(*) filter (where s.mofaic_status in ('Pending', 'Payment Due', 'Overdue')),
        'physical_docs_pending', count(*) filter (where s.physical_doc_status in ('Pending', 'Ready for Dispatch')),
        -- 'resubmissions' used to check overall_status = 'Resubmission
        -- Required', which no longer exists — resubmissions are tracked
        -- through Exceptions now.
        'resubmissions', (
          select count(*) from public.resubmission_attempts ra
          join public.exceptions e on e.id = ra.exception_id
          join public.shipments s3 on s3.id = e.shipment_id
          where ra.authority_result = 'Pending' and (v_branch_filter is null or s3.branch_id = v_branch_filter)
        ),
        -- 'Ready for Collection' no longer exists — closest current
        -- equivalent is Municipality having just finished (cleared, not
        -- yet physically received back at FFC).
        'ready_for_collection', count(*) filter (where s.overall_status = 'Dubai Municipality'),
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
          where not (s.delivered_date is not null and s.eta is not null and s.delivered_date > s.eta)
        ),
        'delayed', count(*) filter (
          where s.delivered_date is not null and s.eta is not null and s.delivered_date > s.eta
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
          and overall_status <> 'Completed' and responsible is not null
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
          where (v_branch_filter is null or s.branch_id = v_branch_filter)
            and not exists (
              select 1 from public.documents d join public.document_types dt on dt.id = d.document_type_id
              where d.shipment_id = s.id and dt.name = 'Commercial Invoice'
            )
          union all
          select s.id, s.ref, 'AWB missing', 'High'
          from public.shipments s
          where (v_branch_filter is null or s.branch_id = v_branch_filter) and s.awb is null
          union all
          select s.id, s.ref, 'Packing list missing', 'High'
          from public.shipments s
          where (v_branch_filter is null or s.branch_id = v_branch_filter)
            and not exists (
              select 1 from public.documents d join public.document_types dt on dt.id = d.document_type_id
              where d.shipment_id = s.id and dt.name = 'Packing List'
            )
          -- The old 'Dubai Customs rejected' and 'Resubmission required'
          -- alerts checked customs_status = 'Rejected' / overall_status =
          -- 'Resubmission Required', neither of which exist anymore —
          -- rejections and resubmissions are tracked through Exceptions
          -- now, which already surfaces its own alerts via
          -- exception_types/open_exceptions above, so these two specific
          -- hardcoded alerts are gone rather than duplicated.
          union all
          select s.id, s.ref, 'Customs declaration pending', 'Medium'
          from public.shipments s
          where (v_branch_filter is null or s.branch_id = v_branch_filter)
            and s.customs_status in ('Pending', 'Draft')
          union all
          select s.id, s.ref, 'Municipality record pending', 'Medium'
          from public.shipments s
          where (v_branch_filter is null or s.branch_id = v_branch_filter) and s.municipality_status = 'Draft'
          union all
          select s.id, s.ref, 'Delivery order pending', 'Medium'
          from public.shipments s
          where (v_branch_filter is null or s.branch_id = v_branch_filter)
            and s.delivery_order_status in ('Pending', 'Requested')
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
            and s.physical_doc_status in ('Pending', 'Ready for Dispatch')
          union all
          -- 'ETA passed but shipment not received' used to check for not
          -- yet reaching the old 'Received' stage — closest current
          -- equivalent: ETA has passed but the shipment hasn't even
          -- progressed past the very first stage yet.
          select s.id, s.ref, 'ETA passed but shipment still at Created stage', 'Critical'
          from public.shipments s
          where (v_branch_filter is null or s.branch_id = v_branch_filter)
            and s.eta is not null and (s.eta at time zone 'Asia/Dubai')::date < v_today
            and s.overall_status = 'Created'
          union all
          -- 'Shipment not closed after clearance' used to check overall_status
          -- in ('Ready for Collection', 'Received') — closest equivalent
          -- now is sitting at Dubai Municipality (cleared) without moving
          -- on for a while.
          select s.id, s.ref, 'Shipment not closed after clearance', 'Medium'
          from public.shipments s
          where (v_branch_filter is null or s.branch_id = v_branch_filter)
            and s.overall_status = 'Dubai Municipality'
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

-- ---------- 9. get_shipment_header_context — remove the dead Change Status feature ----------
-- valid_status_transitions and the approve_status_change/close_reopen
-- permission flags existed purely to drive the Change Status / Complete
-- Shipment buttons, both now gone entirely in favor of automatic
-- progression. status_transitions itself is left in place undropped (no
-- harm in it existing unused) but nothing reads from it anymore.
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
    'mofaic_status', v_shipment.mofaic_status,
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
    'open_exception_count', (
      select count(*) from public.exceptions where shipment_id = p_shipment_id and status not in ('Resolved', 'Closed')
    ),
    'permissions', jsonb_build_object(
      'assign', coalesce((select allowed from public.role_permissions where role = v_profile.role and permission = 'assign'), false),
      'manage_exceptions', coalesce((select allowed from public.role_permissions where role = v_profile.role and permission = 'manage_exceptions'), false),
      'edit_basic', coalesce((select allowed from public.role_permissions where role = v_profile.role and permission = 'edit_basic'), false)
    )
  ) into v_result;

  return v_result;
end;
$$;
revoke all on function get_shipment_header_context(uuid) from public;
grant execute on function get_shipment_header_context(uuid) to authenticated;

-- ---------- 9.4. fn_is_shipment_completion_eligible — same criteria as the trigger ----------
-- Internal-only integrity check (already revoked from authenticated
-- earlier in 20260101000002 — create or replace here only changes the
-- body, that revoke stays in effect). Deliberately recomputes eligibility
-- independently rather than trusting the cached completion_eligible
-- column, so a test can verify tampering with that cache doesn't fool
-- anything real. Same new criteria as fn_recalculate_shipment_progress —
-- overall_status is no longer part of the check at all, since it's now
-- the OUTPUT of eligibility, not a precondition for it.
create or replace function fn_is_shipment_completion_eligible(p_shipment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shipment public.shipments;
  v_has_blocking_exception boolean;
  v_has_pending_resubmission boolean;
begin
  select * into v_shipment from public.shipments where id = p_shipment_id;
  if v_shipment.id is null then
    raise exception 'NOT_FOUND: shipment % does not exist', p_shipment_id using errcode = 'P0002';
  end if;

  select exists (
    select 1 from public.exceptions
    where shipment_id = p_shipment_id and severity in ('Critical','High') and status not in ('Resolved','Closed')
  ) into v_has_blocking_exception;

  select exists (
    select 1 from public.resubmission_attempts ra join public.exceptions e on e.id = ra.exception_id
    where e.shipment_id = p_shipment_id and ra.authority_result = 'Pending'
  ) into v_has_pending_resubmission;

  return
    v_shipment.document_status in ('Complete','Verified')
    and v_shipment.customs_status = 'Finished'
    and v_shipment.municipality_status in ('Not Required','Finished')
    and v_shipment.delivery_order_status in ('Not Required','Verified')
    and v_shipment.mofaic_status in ('Not Applicable','Completed','Paid')
    and v_shipment.physical_doc_status in ('Not Required','Closed','Proof of Delivery Received')
    and not v_has_blocking_exception
    and not v_has_pending_resubmission;
end;
$$;

-- ---------- 9.5. Clean up everything else that depended on manual status ----------

-- Historical import used to map a raw source status string onto
-- overall_status directly — now overall_status is never set manually,
-- even during import. Once the import inserts real subprocess data
-- (branch, category, etc.), the recalculation trigger derives the
-- correct stage on its own. The original raw text is still fully
-- preserved in source_status_raw for reference either way.
create or replace function fn_commit_import_batch_chunk(p_batch_id uuid, p_default_branch_id uuid, p_default_category_id uuid)
returns table(committed_this_chunk int, remaining int, batch_status public.import_batch_status)
language plpgsql security definer set search_path = ''
as $$
declare
  v_admin public.profiles;
  v_row record;
  v_ref text;
  v_shipment_id uuid;
  v_chunk_size int;
  v_committed_count int := 0;
  v_remaining_count int;
  v_mismatch record;
  v_dup_shipment text;
begin
  v_admin := public.fn_require_permission('administer');

  select chunk_size into v_chunk_size from public.import_batches where id = p_batch_id;
  if v_chunk_size is null then
    raise exception 'NOT_FOUND: import batch % does not exist', p_batch_id using errcode = 'P0002';
  end if;

  update public.import_batches set status = 'Committing' where id = p_batch_id and status in ('Validated','Committing');

  for v_row in
    select * from public.import_staging_rows
    where batch_id = p_batch_id and validation_status in ('Valid','Warning') and not committed
    order by source_row_number
    limit v_chunk_size
  loop
    begin
      if v_row.normalized_values->>'awb' is not null then
        select ref into v_dup_shipment from public.shipments where awb = v_row.normalized_values->>'awb' limit 1;
        if v_dup_shipment is not null then
          insert into public.import_validation_issues (staging_row_id, issue_code, issue_message, severity)
          values (v_row.id, 'PRODUCTION_DUPLICATE_AWB', 'AWB already exists on production shipment ' || v_dup_shipment, 'Warning');
        end if;
      end if;

      v_ref := public.generate_shipment_ref('AIR', extract(year from coalesce((v_row.normalized_values->>'invoice_date')::date, current_date))::int);

      insert into public.shipments (
        ref, mode, shipment_date, category_id, branch_id, supplier_name_snapshot,
        awb, import_batch_id, import_staging_row_id,
        source_status_raw, source_reference_raw, created_by, updated_by
      ) values (
        v_ref, 'Air', coalesce((v_row.normalized_values->>'invoice_date')::date, current_date),
        p_default_category_id, p_default_branch_id, v_row.normalized_values->>'supplier',
        v_row.normalized_values->>'awb',
        p_batch_id, v_row.id,
        v_row.raw_values->>'status', v_row.raw_values->>'portal_reference',
        v_admin.id, v_admin.id
      ) returning id into v_shipment_id;

      if v_row.normalized_values->>'invoice_no' is not null then
        insert into public.invoices (shipment_id, invoice_no, invoice_date, supplier_name_snapshot, invoice_value, currency_code, created_by, updated_by)
        values (
          v_shipment_id, v_row.normalized_values->>'invoice_no', (v_row.normalized_values->>'invoice_date')::date,
          v_row.normalized_values->>'supplier', (v_row.normalized_values->>'invoice_value')::numeric,
          coalesce(v_row.raw_values->>'currency', 'AED'), v_admin.id, v_admin.id
        );
      end if;

      update public.import_staging_rows set committed = true, committed_shipment_id = v_shipment_id where id = v_row.id;
      v_committed_count := v_committed_count + 1;

    exception when others then
      insert into public.import_validation_issues (staging_row_id, issue_code, issue_message, severity)
      values (v_row.id, 'COMMIT_ERROR', 'Row failed during commit: ' || SQLERRM, 'Error');
      update public.import_staging_rows set validation_status = 'Invalid' where id = v_row.id;
    end;
  end loop;

  select count(*) into v_remaining_count from public.import_staging_rows
  where batch_id = p_batch_id and validation_status in ('Valid','Warning') and not committed;

  if v_remaining_count = 0 then
    update public.import_monthly_reconciliation r set committed_count = (
      select count(*) from public.import_staging_rows s
      where s.batch_id = p_batch_id and s.source_month = r.month_label and s.committed
    ) where r.batch_id = p_batch_id;

    select * into v_mismatch from public.import_monthly_reconciliation
    where batch_id = p_batch_id and committed_count <> expected_count
    limit 1;

    if v_mismatch.month_label is not null then
      update public.import_batches set
        status = 'Failed',
        reconciliation_passed = false,
        failure_reason = format('RECONCILIATION_MISMATCH: %s expected %s committed rows, got %s',
          v_mismatch.month_label, v_mismatch.expected_count, v_mismatch.committed_count)
      where id = p_batch_id;

      insert into public.audit_log (action, module, comment, source, result)
      values ('Import batch reconciliation failed', 'import_batches',
        format('batch=%s month=%s expected=%s got=%s', p_batch_id, v_mismatch.month_label, v_mismatch.expected_count, v_mismatch.committed_count),
        'rpc', 'Failure');
    else
      update public.import_batches set
        status = 'Committed', reconciliation_passed = true, committed_at = now(), committed_by = v_admin.id
      where id = p_batch_id;
    end if;
  end if;

  return query
    select v_committed_count, v_remaining_count,
      (select status from public.import_batches where id = p_batch_id);
end;
$$;
revoke all on function fn_commit_import_batch_chunk(uuid, uuid, uuid) from public;
grant execute on function fn_commit_import_batch_chunk(uuid, uuid, uuid) to authenticated;

drop function if exists fn_map_source_status_to_overall(text);

-- status_transitions existed purely to drive change_shipment_status's
-- valid-next-status list — fully vestigial now that overall_status is
-- never manually set at all.
drop table if exists status_transitions;

-- previous_status_before_reopen existed to support manually "reopening"
-- a Completed shipment back to its prior status — that concept doesn't
-- apply anymore either: if a subprocess status genuinely regresses after
-- completion, the recalculation trigger naturally re-derives an earlier
-- stage on its own, with no separate manual reopen step needed.
alter table shipments drop column if exists previous_status_before_reopen;

-- ---------- 9.6. get_report_supplier_performance — fix the Cancelled reference ----------
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
  -- 'Cancelled' no longer exists as an overall_status value — every
  -- shipment counts here now.
  where (coalesce(v_view_all, false) or s.branch_id = v_profile.branch_id)
  group by s.supplier_name_snapshot
  order by total_shipments desc
  limit v_page_size offset v_offset;
end;
$$;

-- ---------- 9.7. create_shipment — remove the hardcoded 'Draft' entirely ----------
-- The version rebuilt in 20260101000024 still explicitly set
-- overall_status = 'Draft' in its INSERT — 'Draft' doesn't exist as a
-- value anymore, and more fundamentally, overall_status is never set
-- directly at all now. Every other piece of this function (supplier
-- requirement, mode/priority/date validation) is unchanged — only the
-- INSERT's column list changes, dropping overall_status so it takes its
-- real default ('Created') and lets the recalculation trigger take over
-- from there based on whatever real subprocess data follows.
create or replace function create_shipment(
  p_mode text, p_shipment_date date, p_category_id uuid, p_branch_id uuid,
  p_supplier_id uuid, p_supplier_name text, p_origin_country_id uuid, p_priority text,
  p_responsible uuid, p_internal_ref text default null, p_notes text default null
) returns public.shipments
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_ref text;
  v_year int;
  v_shipment public.shipments;
  v_supplier_name text;
  v_supplier_active boolean;
begin
  v_profile := public.fn_require_branch_access(p_branch_id, 'create_draft');
  perform public.fn_require_assignable_profile(p_responsible, p_branch_id);

  if p_mode is distinct from 'Air' then
    raise exception 'INVALID_MODE: only Air shipments are supported in this phase (got %)', p_mode
      using errcode = '23514';
  end if;

  if p_priority is not null and p_priority not in ('Low','Medium','High','Critical') then
    raise exception 'INVALID_PRIORITY: % is not a recognized priority', p_priority using errcode = '23514';
  end if;

  if p_shipment_date is null then
    raise exception 'INVALID_DATE: shipment date is required' using errcode = '23502';
  end if;

  if not exists (select 1 from public.branches where id = p_branch_id and is_active) then
    raise exception 'INVALID_BRANCH: branch is not active or does not exist' using errcode = '23514';
  end if;
  if p_category_id is not null and not exists (
    select 1 from public.shipment_categories where id = p_category_id and is_active
  ) then
    raise exception 'INVALID_CATEGORY: category is not active or does not exist' using errcode = '23514';
  end if;
  if p_origin_country_id is not null and not exists (
    select 1 from public.countries where id = p_origin_country_id and is_active
  ) then
    raise exception 'INVALID_COUNTRY: origin country is not active or does not exist' using errcode = '23514';
  end if;

  if p_supplier_id is null then
    raise exception 'SUPPLIER_REQUIRED: a valid supplier must be selected — administrators can add a new supplier under Master Data' using errcode = '23502';
  end if;

  select name, is_active into v_supplier_name, v_supplier_active
  from public.suppliers where id = p_supplier_id;
  if v_supplier_name is null then
    raise exception 'SUPPLIER_NOT_FOUND: supplier % does not exist', p_supplier_id using errcode = 'P0002';
  end if;
  if not v_supplier_active then
    raise exception 'SUPPLIER_INACTIVE: supplier % is not active', p_supplier_id using errcode = '23514';
  end if;

  v_year := extract(year from p_shipment_date)::int;
  v_ref := public.generate_shipment_ref(p_mode, v_year);

  insert into public.shipments (
    ref, mode, shipment_date, category_id, branch_id, supplier_id, supplier_name_snapshot,
    origin_country_id, priority, responsible, internal_ref, notes, created_by, updated_by
  ) values (
    v_ref, p_mode, p_shipment_date, p_category_id, p_branch_id, p_supplier_id, v_supplier_name,
    p_origin_country_id, coalesce(p_priority, 'Medium'), p_responsible, p_internal_ref, p_notes, v_profile.id, v_profile.id
  ) returning * into v_shipment;

  return v_shipment;
end;
$$;

-- ---------- 10. Drop the old enum types, now that nothing depends on them ----------
drop type customs_status_old;
drop type municipality_status_old;
drop type overall_status_old;
