-- ============================================================
-- FFC Shipments Management System
-- 20260101000005_performance_optimization.sql
--
-- Performance pass: consolidates several query waterfalls that were
-- happening on every request into single RPCs, optimizes RLS policies
-- to avoid per-row re-evaluation of auth.uid()/stable helper functions,
-- and adds indexes for the app's actual real query patterns.
--
-- Every RPC here is read-only and additive — nothing existing is
-- dropped, no permission check is removed, no RLS policy is loosened.
-- ============================================================

-- ============================================================
-- SECTION A — get_app_shell_context()
--
-- Replaces what the root (app) layout was doing as 3 SEQUENTIAL queries
-- on every single page load (profile lookup, then branch lookup, then
-- notification count) with one round trip. Returns an explicit
-- {ok:false, reason:...} shape for the no-profile/inactive cases rather
-- than raising — the layout needs to distinguish these into different
-- /access-denied reasons exactly as before, and a returned value is
-- easier to branch on than parsing an exception message.
-- ============================================================
create or replace function get_app_shell_context()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_branch_name text;
  v_unread_count int;
  v_permissions jsonb;
begin
  select * into v_profile from public.profiles where id = auth.uid();

  if v_profile.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no-profile');
  end if;

  if not v_profile.is_active then
    return jsonb_build_object('ok', false, 'reason', 'inactive');
  end if;

  if v_profile.branch_id is not null then
    select name into v_branch_name from public.branches where id = v_profile.branch_id;
  end if;

  select count(*) into v_unread_count from public.notifications
    where recipient = auth.uid() and not is_read;

  select coalesce(jsonb_object_agg(permission, allowed), '{}'::jsonb) into v_permissions
    from public.role_permissions where role = v_profile.role;

  return jsonb_build_object(
    'ok', true,
    'user_id', v_profile.id,
    'full_name', v_profile.full_name,
    'role', v_profile.role,
    'branch_id', v_profile.branch_id,
    'branch_name', v_branch_name,
    'permissions', v_permissions,
    'unread_notification_count', v_unread_count,
    'can_view_all_branches', coalesce((v_permissions->>'view_all_branches')::boolean, false)
  );
end;
$$;
revoke all on function get_app_shell_context() from public;
grant execute on function get_app_shell_context() to authenticated;

-- ============================================================
-- SECTION B — get_dashboard_metrics(p_branch_id)
--
-- Replaces 4 separate `count(*)` round trips with one row of filtered
-- aggregates. p_branch_id is optional — null means "use the caller's
-- own branch, or all branches if they hold view_all_branches"; passing
-- an explicit branch_id lets an authorized cross-branch role request a
-- specific branch's numbers without re-deriving that logic client-side.
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
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null or not v_profile.is_active then
    raise exception 'INACTIVE_OR_MISSING_PROFILE: no active profile for this session' using errcode = '28000';
  end if;

  select rp.allowed into v_view_all from public.role_permissions rp
    where rp.role = v_profile.role and rp.permission = 'view_all_branches';

  -- An explicit branch filter is only honored for a role that's actually
  -- allowed to see other branches — otherwise silently fall back to the
  -- caller's own branch rather than either erroring or (worse) trusting
  -- a client-supplied branch_id at face value.
  v_branch_filter := case
    when coalesce(v_view_all, false) then p_branch_id
    else v_profile.branch_id
  end;

  v_today := (now() at time zone 'Asia/Dubai')::date;

  return (
    select jsonb_build_object(
      'total_active', count(*) filter (where s.overall_status <> 'Cancelled'),
      'in_progress', count(*) filter (where s.overall_status not in ('Completed', 'Cancelled')),
      'completed', count(*) filter (where s.overall_status = 'Completed'),
      'needs_attention', count(*) filter (where s.overall_status in ('On Hold', 'Rejected', 'Resubmission Required')),
      'documents_pending', count(*) filter (where s.document_status not in ('Verified', 'Complete')),
      'customs_pending', count(*) filter (
        where s.customs_status not in ('Approved', 'Closed') and s.overall_status not in ('Draft', 'Cancelled')
      ),
      'delivery_orders_pending', count(*) filter (where s.delivery_order_status in ('Pending', 'Requested')),
      'mofaic_pending', count(*) filter (where s.mofaic_status in ('Pending', 'Payment Due', 'Overdue')),
      'physical_docs_pending', count(*) filter (where s.physical_doc_status in ('Originals Pending', 'Ready for Dispatch')),
      'open_exceptions', (
        select count(*) from public.exceptions e
        join public.shipments s2 on s2.id = e.shipment_id
        where e.status not in ('Resolved', 'Closed')
          and (v_branch_filter is null or s2.branch_id = v_branch_filter)
      ),
      'arriving_today', count(*) filter (
        where s.eta is not null and (s.eta at time zone 'Asia/Dubai')::date = v_today
      ),
      'arriving_this_week', count(*) filter (
        where s.eta is not null
          and (s.eta at time zone 'Asia/Dubai')::date >= v_today
          and (s.eta at time zone 'Asia/Dubai')::date <= v_today + 7
      )
    )
    from public.shipments s
    where v_branch_filter is null or s.branch_id = v_branch_filter
  );
end;
$$;
revoke all on function get_dashboard_metrics(uuid) from public;
grant execute on function get_dashboard_metrics(uuid) to authenticated;

-- ============================================================
-- SECTION C — get_shipment_header_context(p_shipment_id)
--
-- Replaces the shipment detail layout's separate port/responsible-
-- profile/invoice-totals/transitions/permission queries with one call.
-- Deliberately does NOT include the full assignable-profiles list —
-- that's only needed when the Assign modal is actually opened, so it
-- stays a separate on-demand query rather than bloating every single
-- shipment page load with a list nobody asked for yet.
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

-- ============================================================
-- SECTION D — RLS optimization: (select auth.uid()) / (select fn_...())
--
-- auth.uid() and fn_is_active_profile() are STABLE, but a bare call to
-- either one inside a row-security USING clause still gets evaluated
-- once PER ROW during a sequential/index scan — Postgres only hoists it
-- into a single InitPlan (evaluated once per statement) when it's
-- wrapped as a scalar subquery. This is a well-documented Supabase/
-- Postgres RLS performance pattern, not a behavior change: every policy
-- below still enforces exactly the same condition, just computed once
-- instead of once per row.
--
-- Applied only to the policies on tables that actually get scanned with
-- many rows per query (shipments, notifications, saved views, audit_log)
-- — the tiny reference tables (branches, countries, etc.) wouldn't see a
-- measurable benefit and aren't touched here to keep this change's
-- blast radius limited to where it actually matters.
-- ============================================================
drop policy if exists p_select_shipments on shipments;
create policy p_select_shipments on shipments for select
to authenticated
using (
  (select fn_is_active_profile())
  and (
    (select has_permission('view_all_branches'))
    or branch_id = (select branch_id from profiles where id = (select auth.uid()))
  )
);

drop policy if exists p_select_own_notifications on notifications;
create policy p_select_own_notifications on notifications for select
to authenticated
using (
  (select fn_is_active_profile()) and recipient = (select auth.uid())
);

drop policy if exists p_update_own_notifications on notifications;
create policy p_update_own_notifications on notifications for update
to authenticated
using ((select fn_is_active_profile()) and recipient = (select auth.uid()))
with check (recipient = (select auth.uid()));

drop policy if exists p_manage_own_saved_views on user_saved_views;
create policy p_manage_own_saved_views on user_saved_views for all
to authenticated
using ((select fn_is_active_profile()) and owner = (select auth.uid()))
with check (owner = (select auth.uid()));

drop policy if exists p_select_audit_log on audit_log;
create policy p_select_audit_log on audit_log for select
to authenticated
using (
  (select fn_is_active_profile())
  and (
    (
      shipment_ref is not null
      and (
        (select has_permission('view_all_branches'))
        or exists (
          select 1 from shipments s
          where s.ref = audit_log.shipment_ref
            and s.branch_id = (select branch_id from profiles where id = (select auth.uid()))
        )
      )
    )
    or (shipment_ref is null and (select has_permission('administer')))
  )
);

-- ============================================================
-- SECTION E — Indexes for the app's actual query patterns
--
-- Each one supports a specific query already in the codebase (register
-- filters/sorting, tab lookups, notification bell, audit trail). Checked
-- against pg_indexes first where a near-duplicate might already exist
-- from the initial schema — these use IF NOT EXISTS so re-running this
-- file is harmless either way.
-- ============================================================
create index if not exists idx_shipments_branch_created on shipments (branch_id, created_at desc);
create index if not exists idx_shipments_branch_status_created on shipments (branch_id, overall_status, created_at desc);
create index if not exists idx_shipments_responsible_created on shipments (responsible, created_at desc);
create index if not exists idx_shipments_branch_eta on shipments (branch_id, eta);
create index if not exists idx_shipment_comments_shipment_created on shipment_comments (shipment_id, created_at desc);
create index if not exists idx_invoices_shipment_created on invoices (shipment_id, created_at desc);
create index if not exists idx_documents_shipment_created on documents (shipment_id, created_at desc);
create index if not exists idx_document_versions_doc_version on document_versions (document_id, version_number desc);
create index if not exists idx_notifications_recipient_unread_created on notifications (recipient, is_read, created_at desc);
create index if not exists idx_audit_log_shipment_ref_occurred on audit_log (shipment_ref, occurred_at desc);
create index if not exists idx_exceptions_shipment_status on exceptions (shipment_id, status);
create index if not exists idx_resubmission_exception_attempt on resubmission_attempts (exception_id, attempt_no);

-- ============================================================
-- SECTION F — Replace v_assignable_profiles with a secure RPC
--
-- v_assignable_profiles was a plain view with no security_invoker,
-- meaning it runs with its OWNER's privileges (not the querying user's)
-- and completely bypasses the profiles table's own branch-scoped RLS
-- policy. Any authenticated user could see every active profile across
-- every branch through it — a real cross-branch data leak, not a
-- theoretical one. Replaced with a SECURITY DEFINER RPC that enforces
-- the same branch/permission rules explicitly instead of relying on a
-- view that happened to skip them.
-- ============================================================
create or replace function get_assignable_profiles(
  p_branch_id uuid default null,
  p_required_permission text default null
)
returns table (id uuid, full_name text, role app_role, branch_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_view_all boolean;
  v_target_branch uuid;
begin
  select * into v_profile from public.profiles pr where pr.id = auth.uid();
  if v_profile.id is null or not v_profile.is_active then
    raise exception 'INACTIVE_OR_MISSING_PROFILE: no active profile for this session' using errcode = '28000';
  end if;

  select rp.allowed into v_view_all from public.role_permissions rp
    where rp.role = v_profile.role and rp.permission = 'view_all_branches';

  -- A normal user only ever sees their own branch, full stop — an
  -- explicit p_branch_id argument is only honored for someone who
  -- actually holds view_all_branches; otherwise it's silently ignored
  -- in favor of the caller's own branch rather than trusted at face
  -- value (same pattern as get_dashboard_metrics).
  v_target_branch := case
    when coalesce(v_view_all, false) then p_branch_id
    else v_profile.branch_id
  end;

  return query
  select p.id, p.full_name, p.role, p.branch_id
  from public.profiles p
  where p.is_active
    and (
      coalesce(v_view_all, false) and v_target_branch is null  -- explicit "all branches" request from an authorized role
      or p.branch_id = v_target_branch
    )
    and (
      p_required_permission is null
      or exists (
        select 1 from public.role_permissions rp
        where rp.role = p.role and rp.permission = p_required_permission and rp.allowed
      )
    )
  order by p.full_name;
end;
$$;
revoke all on function get_assignable_profiles(uuid, text) from public;
grant execute on function get_assignable_profiles(uuid, text) to authenticated;

-- The insecure view is superseded by the RPC above — revoke the
-- authenticated grant so nothing can fall back to the unsafe path, but
-- leave the view itself defined (some internal SECURITY DEFINER
-- functions may still reference it safely from within their own elevated
-- context) rather than dropping it and risking breaking something that
-- depends on the relation existing.
revoke select on v_assignable_profiles from authenticated;

-- ============================================================
-- SECTION G — Per-tab RPCs
--
-- Each shipment tab now has exactly one RPC covering everything that
-- tab's page needs: the shipment-scoped data, joined names (never a
-- separate profile/master-data lookup), and the permission flag the tab
-- needs to decide whether to show its edit control. Every one of these
-- re-validates branch access itself (never assumes the caller already
-- checked, since an RPC can be called directly) and requires an active
-- profile the same way the other context RPCs do.
-- ============================================================

-- Shared helper: fn_require_shipment_access(uuid, text) already exists
-- from an earlier round and does exactly this (branch-access check,
-- returns the shipment row) — reused here with p_permission = null
-- rather than duplicating it under a new name, which would have created
-- an ambiguous overload (Postgres couldn't tell a 1-arg call apart from
-- the existing 2-arg version's default parameter, and this was caught
-- immediately when the first functional test came back "not unique").
create or replace function fn_permission_for(p_role app_role, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select rp.allowed from public.role_permissions rp where rp.role = p_role and rp.permission = p_permission), false);
$$;
revoke all on function fn_permission_for(app_role, text) from public;
grant execute on function fn_permission_for(app_role, text) to authenticated;

-- ---------- Overview ----------
create or replace function get_shipment_overview_tab(p_shipment_id uuid)
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
    'internal_ref', v_shipment.internal_ref,
    'mode', v_shipment.mode,
    'category_name', (select c.name from public.shipment_categories c where c.id = v_shipment.category_id),
    'branch_name', (select b.name from public.branches b where b.id = v_shipment.branch_id),
    'priority', v_shipment.priority,
    'coordinator_name', (select pr2.full_name from public.profiles pr2 where pr2.id = v_shipment.coordinator),
    'created_at', v_shipment.created_at,
    'packages', v_shipment.packages,
    'net_weight', v_shipment.net_weight,
    'gross_weight', v_shipment.gross_weight,
    'notes', v_shipment.notes,
    'completion_eligible', v_shipment.completion_eligible,
    'related_shipments', (
      select coalesce(jsonb_agg(jsonb_build_object('id', s2.id, 'ref', s2.ref, 'shipment_date', s2.shipment_date, 'overall_status', s2.overall_status) order by s2.shipment_date desc), '[]'::jsonb)
      from public.shipments s2
      where s2.supplier_name_snapshot = v_shipment.supplier_name_snapshot and s2.id <> v_shipment.id
      limit 10
    )
  );
end;
$$;
revoke all on function get_shipment_overview_tab(uuid) from public;
grant execute on function get_shipment_overview_tab(uuid) to authenticated;

-- ---------- Invoices ----------
create or replace function get_shipment_invoices_tab(p_shipment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_shipment public.shipments;
  v_profile public.profiles;
  v_invoices jsonb;
  v_totals_by_currency jsonb;
  v_aed_total numeric;
begin
  v_shipment := public.fn_require_shipment_access(p_shipment_id, null);
  select * into v_profile from public.profiles pr where pr.id = auth.uid();

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'invoice_no', i.invoice_no, 'invoice_date', i.invoice_date,
    'supplier_name_snapshot', i.supplier_name_snapshot, 'invoice_value', i.invoice_value,
    'currency_code', i.currency_code, 'payment_terms', i.payment_terms, 'remarks', i.remarks
  ) order by i.created_at desc), '[]'::jsonb) into v_invoices
  from public.invoices i where i.shipment_id = p_shipment_id;

  select coalesce(jsonb_object_agg(t.currency_code, t.total), '{}'::jsonb) into v_totals_by_currency
  from (select currency_code, sum(invoice_value) as total from public.invoices where shipment_id = p_shipment_id group by currency_code) t;

  select coalesce(sum(i.invoice_value * (case when i.currency_code = 'AED' then 1 else coalesce(
    (select fx.rate_to_aed from public.fx_rates fx where fx.currency_code = i.currency_code order by fx.effective_date desc limit 1), 0
  ) end)), 0) into v_aed_total
  from public.invoices i where i.shipment_id = p_shipment_id;

  return jsonb_build_object(
    'invoices', v_invoices,
    'totals_by_currency', v_totals_by_currency,
    'illustrative_aed_total', v_aed_total,
    'can_edit', public.fn_permission_for(v_profile.role, 'edit_invoice') and v_shipment.overall_status <> 'Completed'
  );
end;
$$;
revoke all on function get_shipment_invoices_tab(uuid) from public;
grant execute on function get_shipment_invoices_tab(uuid) to authenticated;

-- ---------- Transport ----------
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

-- ---------- Documents ----------
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
    'can_verify', public.fn_permission_for(v_profile.role, 'verify_docs')
  );
end;
$$;
revoke all on function get_shipment_documents_tab(uuid) from public;
grant execute on function get_shipment_documents_tab(uuid) to authenticated;

-- ---------- Customs ----------
create or replace function get_shipment_customs_tab(p_shipment_id uuid)
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
    'declaration_no', v_shipment.declaration_no,
    'customs_status', v_shipment.customs_status,
    'customs_submission_date', v_shipment.customs_submission_date,
    'customs_remarks', v_shipment.customs_remarks,
    'can_edit', public.fn_permission_for(v_profile.role, 'edit_customs') and v_shipment.overall_status <> 'Completed'
  );
end;
$$;
revoke all on function get_shipment_customs_tab(uuid) from public;
grant execute on function get_shipment_customs_tab(uuid) to authenticated;

-- ---------- Municipality ----------
create or replace function get_shipment_municipality_tab(p_shipment_id uuid)
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
    'municipality_draft_ref', v_shipment.municipality_draft_ref,
    'municipality_submitted_ref', v_shipment.municipality_submitted_ref,
    'municipality_status', v_shipment.municipality_status,
    'municipality_submission_date', v_shipment.municipality_submission_date,
    'municipality_completion_date', v_shipment.municipality_completion_date,
    'municipality_remarks', v_shipment.municipality_remarks,
    'can_edit', public.fn_permission_for(v_profile.role, 'edit_customs') and v_shipment.overall_status <> 'Completed'
  );
end;
$$;
revoke all on function get_shipment_municipality_tab(uuid) from public;
grant execute on function get_shipment_municipality_tab(uuid) to authenticated;

-- ---------- Delivery Order ----------
create or replace function get_shipment_delivery_order_tab(p_shipment_id uuid)
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
    'carrier_id', v_shipment.carrier_id,
    'carrier_name', (select c.name from public.carriers c where c.id = v_shipment.carrier_id),
    'delivery_order_status', v_shipment.delivery_order_status,
    'delivery_order_requested_date', v_shipment.delivery_order_requested_date,
    'delivery_order_received_date', v_shipment.delivery_order_received_date,
    'delivery_order_doc_uploaded', v_shipment.delivery_order_doc_uploaded,
    'delivery_order_responsible', v_shipment.delivery_order_responsible,
    'responsible_name', (select pr2.full_name from public.profiles pr2 where pr2.id = v_shipment.delivery_order_responsible),
    'delivery_order_remarks', v_shipment.delivery_order_remarks,
    'can_edit', public.fn_permission_for(v_profile.role, 'edit_delivery_order') and v_shipment.overall_status <> 'Completed'
  );
end;
$$;
revoke all on function get_shipment_delivery_order_tab(uuid) from public;
grant execute on function get_shipment_delivery_order_tab(uuid) to authenticated;

-- ---------- MOFAIC ----------
create or replace function get_shipment_mofaic_tab(p_shipment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_shipment public.shipments;
  v_profile public.profiles;
  v_window_days int;
  v_due_date date;
begin
  v_shipment := public.fn_require_shipment_access(p_shipment_id, null);
  select * into v_profile from public.profiles pr where pr.id = auth.uid();

  select mr.payment_window_days into v_window_days from public.mofaic_rules mr where mr.id = 1;
  if v_shipment.mofaic_status <> 'Not Applicable' and v_shipment.delivery_order_received_date is not null and v_window_days is not null then
    v_due_date := v_shipment.delivery_order_received_date + v_window_days;
  end if;

  return jsonb_build_object(
    'ref', v_shipment.ref,
    'applicable', v_shipment.mofaic_status <> 'Not Applicable',
    'mofaic_status', v_shipment.mofaic_status,
    'mofaic_ref', v_shipment.mofaic_ref,
    'due_date', v_due_date,
    'days_left', case when v_due_date is not null then (v_due_date - (now() at time zone 'Asia/Dubai')::date) else null end,
    'payment_amount', v_shipment.mofaic_payment_amount,
    'mofaic_currency', v_shipment.mofaic_currency,
    'payment_date', v_shipment.mofaic_payment_date,
    'mofaic_responsible', v_shipment.mofaic_responsible,
    'responsible_name', (select pr2.full_name from public.profiles pr2 where pr2.id = v_shipment.mofaic_responsible),
    'mofaic_remarks', v_shipment.mofaic_remarks,
    'can_edit', public.fn_permission_for(v_profile.role, 'edit_mofaic') and v_shipment.overall_status <> 'Completed'
  );
end;
$$;
revoke all on function get_shipment_mofaic_tab(uuid) from public;
grant execute on function get_shipment_mofaic_tab(uuid) to authenticated;

-- ---------- Physical Documents ----------
create or replace function get_shipment_physical_documents_tab(p_shipment_id uuid)
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
    'physical_doc_status', v_shipment.physical_doc_status,
    'originals_required', v_shipment.originals_required,
    'originals_received', v_shipment.originals_received,
    'ready_for_dispatch', v_shipment.ready_for_dispatch,
    'courier_company_id', v_shipment.courier_company_id,
    'courier_company_name', (select cc.name from public.courier_companies cc where cc.id = v_shipment.courier_company_id),
    'tracking_number', v_shipment.tracking_number,
    'dispatch_date', v_shipment.dispatch_date,
    'delivered_date', v_shipment.delivered_date,
    'pod_received', v_shipment.pod_received,
    'physical_docs_responsible', v_shipment.physical_docs_responsible,
    'responsible_name', (select pr2.full_name from public.profiles pr2 where pr2.id = v_shipment.physical_docs_responsible),
    'physical_docs_remarks', v_shipment.physical_docs_remarks,
    'can_edit', public.fn_permission_for(v_profile.role, 'edit_physical_docs') and v_shipment.overall_status <> 'Completed'
  );
end;
$$;
revoke all on function get_shipment_physical_documents_tab(uuid) from public;
grant execute on function get_shipment_physical_documents_tab(uuid) to authenticated;

-- ---------- Exceptions ----------
create or replace function get_shipment_exceptions_tab(p_shipment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_shipment public.shipments;
  v_profile public.profiles;
  v_exceptions jsonb;
  v_types jsonb;
begin
  v_shipment := public.fn_require_shipment_access(p_shipment_id, null);
  select * into v_profile from public.profiles pr where pr.id = auth.uid();

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'type_name', (select et.name from public.exception_types et where et.id = e.exception_type_id),
    'severity', e.severity, 'description', e.description, 'status', e.status,
    'assigned_to_name', (select pr2.full_name from public.profiles pr2 where pr2.id = e.assigned_to),
    'due_date', e.due_date, 'root_cause', e.root_cause, 'resolution', e.resolution, 'created_at', e.created_at,
    'resubmission_count', (select count(*) from public.resubmission_attempts ra where ra.exception_id = e.id),
    'latest_resubmission_result', (
      select ra.authority_result from public.resubmission_attempts ra
      where ra.exception_id = e.id order by ra.attempt_no desc limit 1
    )
  ) order by e.created_at desc), '[]'::jsonb) into v_exceptions
  from public.exceptions e where e.shipment_id = p_shipment_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', et.id, 'name', et.name)), '[]'::jsonb) into v_types
  from public.exception_types et where et.is_active;

  return jsonb_build_object(
    'exceptions', v_exceptions,
    'exception_types', v_types,
    'can_manage', public.fn_permission_for(v_profile.role, 'manage_exceptions') and v_shipment.overall_status <> 'Completed'
  );
end;
$$;
revoke all on function get_shipment_exceptions_tab(uuid) from public;
grant execute on function get_shipment_exceptions_tab(uuid) to authenticated;

-- ---------- Comments ----------
create or replace function get_shipment_comments_tab(p_shipment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_shipment public.shipments;
  v_profile public.profiles;
  v_comments jsonb;
begin
  v_shipment := public.fn_require_shipment_access(p_shipment_id, null);
  select * into v_profile from public.profiles pr where pr.id = auth.uid();

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'body', c.body, 'created_at', c.created_at,
    'author_name', (select pr2.full_name from public.profiles pr2 where pr2.id = c.author),
    'author_role', (select pr2.role from public.profiles pr2 where pr2.id = c.author)
  ) order by c.created_at desc), '[]'::jsonb) into v_comments
  from public.shipment_comments c where c.shipment_id = p_shipment_id;

  return jsonb_build_object(
    'comments', v_comments,
    'can_comment', public.fn_permission_for(v_profile.role, 'add_comment')
  );
end;
$$;
revoke all on function get_shipment_comments_tab(uuid) from public;
grant execute on function get_shipment_comments_tab(uuid) to authenticated;

-- ---------- Activity ----------
create or replace function get_shipment_activity_tab(p_shipment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_shipment public.shipments;
  v_events jsonb;
begin
  v_shipment := public.fn_require_shipment_access(p_shipment_id, null);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', al.id, 'occurred_at', al.occurred_at, 'action', al.action, 'module', al.module,
    'actor_name', (select pr.full_name from public.profiles pr where pr.id = al.actor),
    'actor_role', al.actor_role, 'comment', al.comment
  ) order by al.occurred_at desc), '[]'::jsonb) into v_events
  from public.audit_log al
  where al.shipment_ref = v_shipment.ref
  limit 100;

  return jsonb_build_object('events', v_events);
end;
$$;
revoke all on function get_shipment_activity_tab(uuid) from public;
grant execute on function get_shipment_activity_tab(uuid) to authenticated;

-- ============================================================
-- SECTION H — New Shipment: one form-context RPC + paginated supplier search
-- ============================================================
create or replace function get_new_shipment_form_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_view_all boolean;
  v_permissions jsonb;
  v_branches jsonb;
begin
  select * into v_profile from public.profiles pr where pr.id = auth.uid();
  if v_profile.id is null or not v_profile.is_active then
    raise exception 'INACTIVE_OR_MISSING_PROFILE: no active profile for this session' using errcode = '28000';
  end if;

  select coalesce(jsonb_object_agg(rp.permission, rp.allowed), '{}'::jsonb) into v_permissions
    from public.role_permissions rp where rp.role = v_profile.role;

  v_view_all := coalesce((v_permissions->>'view_all_branches')::boolean, false);

  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) order by b.name), '[]'::jsonb) into v_branches
    from public.branches b
    where b.is_active and (v_view_all or b.id = v_profile.branch_id);

  return jsonb_build_object(
    'user_id', v_profile.id,
    'fixed_branch_id', case when v_view_all then null else v_profile.branch_id end,
    'branches', v_branches,
    'permissions', v_permissions,
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by display_order), '[]'::jsonb) from public.shipment_categories where is_active),
    'countries', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.countries where is_active),
    'ports', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by display_order), '[]'::jsonb) from public.ports where is_active),
    'airlines', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.airlines where is_active),
    'freight_agents', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.freight_agents where is_active),
    'clearing_agents', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.clearing_agents where is_active),
    'carriers', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.carriers where is_active),
    'courier_companies', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.courier_companies where is_active),
    'document_types', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by display_order), '[]'::jsonb) from public.document_types where is_active),
    'currencies', (select coalesce(jsonb_agg(code order by code), '[]'::jsonb) from public.currencies where is_active)
  );
end;
$$;
revoke all on function get_new_shipment_form_context() from public;
grant execute on function get_new_shipment_form_context() to authenticated;

-- Paginated, indexed supplier search — the New Shipment form context
-- deliberately does NOT return the full supplier list (could be
-- thousands of rows); this backs the searchable combobox instead.
create or replace function search_active_suppliers(
  p_query text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (id uuid, code text, name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_query text;
  v_limit int;
  v_offset int;
begin
  select * into v_profile from public.profiles pr where pr.id = auth.uid();
  if v_profile.id is null or not v_profile.is_active then
    raise exception 'INACTIVE_OR_MISSING_PROFILE: no active profile for this session' using errcode = '28000';
  end if;

  if p_query is not null and length(p_query) > 100 then
    raise exception 'QUERY_TOO_LONG: search text cannot exceed 100 characters' using errcode = '23514';
  end if;

  v_query := nullif(trim(coalesce(p_query, '')), '');
  v_limit := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  return query
  select s.id, s.code, s.name
  from public.suppliers s
  where s.is_active
    and (v_query is null or s.name ilike '%' || v_query || '%')
  order by s.display_order, s.name
  limit v_limit offset v_offset;
end;
$$;
revoke all on function search_active_suppliers(text, int, int) from public;
grant execute on function search_active_suppliers(text, int, int) to authenticated;
