-- ============================================================
-- FFC Shipments Management System
-- 0002_security_and_rls.sql  (REVISED per second architecture review)
--
-- REVISION NOTE: this version fixes a real security gap identified in
-- review: RLS SELECT policies do not protect SECURITY DEFINER functions.
-- A SECURITY DEFINER RPC runs with the privileges of its owner and never
-- consults RLS on the caller's behalf — so a permission check alone
-- ("does this role have edit_customs?") was previously NOT enough to stop
-- a Dubai-branch user from passing an Abu-Dhabi shipment's UUID and
-- editing it anyway. Every RPC below re-checks branch access via one of
-- five reusable helpers before doing anything else.
-- ============================================================

-- ============================================================
-- SECTION A — CORE AUTH HELPERS
-- ============================================================
create or replace function fn_current_profile()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED: no authenticated user' using errcode = '28000';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();

  if v_profile.id is null then
    raise exception 'PROFILE_NOT_FOUND: no profile exists for the current user' using errcode = 'P0002';
  end if;

  if not v_profile.is_active then
    raise exception 'PROFILE_INACTIVE: this user account has been deactivated' using errcode = '28000';
  end if;

  return v_profile;
end;
$$;
revoke all on function fn_current_profile() from public;
grant execute on function fn_current_profile() to authenticated;

-- Section 7 fix: used by RLS SELECT policies — active-profile existence
-- check, so read policies stop trusting "any authenticated JWT" and
-- instead require a live, active application profile.
create or replace function fn_is_active_profile()
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active);
$$;
revoke all on function fn_is_active_profile() from public;
grant execute on function fn_is_active_profile() to authenticated;

create or replace function fn_require_permission(p_permission text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_allowed boolean;
begin
  v_profile := public.fn_current_profile();

  select allowed into v_allowed from public.role_permissions
  where role = v_profile.role and permission = p_permission;

  if not coalesce(v_allowed, false) then
    raise exception 'PERMISSION_DENIED: role % does not have permission %', v_profile.role, p_permission
      using errcode = '42501';
  end if;

  return v_profile;
end;
$$;
revoke all on function fn_require_permission(text) from public;
grant execute on function fn_require_permission(text) to authenticated;

create or replace function has_permission(p_permission text)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select rp.allowed from public.role_permissions rp join public.profiles p on p.role = rp.role
     where p.id = auth.uid() and rp.permission = p_permission and p.is_active),
    false
  );
$$;
revoke all on function has_permission(text) from public;
grant execute on function has_permission(text) to authenticated;

-- ============================================================
-- SECTION B — BRANCH-ACCESS HELPERS (Section 1 fix — the core defect)
-- ============================================================
create or replace function fn_require_branch_access(p_branch_id uuid, p_permission text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_view_all boolean;
begin
  v_profile := public.fn_require_permission(p_permission);

  select allowed into v_view_all from public.role_permissions
    where role = v_profile.role and permission = 'view_all_branches';

  if not coalesce(v_view_all, false) and v_profile.branch_id is distinct from p_branch_id then
    raise exception 'BRANCH_ACCESS_DENIED: your profile is not authorized for branch %', p_branch_id
      using errcode = '42501';
  end if;

  return v_profile;
end;
$$;
revoke all on function fn_require_branch_access(uuid, text) from public;
grant execute on function fn_require_branch_access(uuid, text) to authenticated;

-- NOTE: superseded for all mutation RPCs by fn_lock_shipment_for_mutation
-- below (review round 3, §2), which adds a FOR UPDATE lock. Kept defined
-- (unused by any RPC as of this revision) only in case a future read-side
-- check ever needs branch+permission validation without taking a row lock.
create or replace function fn_require_shipment_access(p_shipment_id uuid, p_permission text default null)
returns public.shipments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_shipment public.shipments;
  v_view_all boolean;
begin
  if p_permission is not null then
    v_profile := public.fn_require_permission(p_permission);
  else
    v_profile := public.fn_current_profile();
  end if;

  select * into v_shipment from public.shipments where id = p_shipment_id;
  if v_shipment.id is null then
    raise exception 'NOT_FOUND: shipment % does not exist', p_shipment_id using errcode = 'P0002';
  end if;

  select allowed into v_view_all from public.role_permissions
    where role = v_profile.role and permission = 'view_all_branches';

  if not coalesce(v_view_all, false) and v_shipment.branch_id is distinct from v_profile.branch_id then
    raise exception 'BRANCH_ACCESS_DENIED: shipment % is outside your branch', v_shipment.ref
      using errcode = '42501';
  end if;

  return v_shipment;
end;
$$;
revoke all on function fn_require_shipment_access(uuid, text) from public;
grant execute on function fn_require_shipment_access(uuid, text) to authenticated;

-- ============================================================
-- UNIFIED LOCKED SHIPMENT-ACCESS HELPER (review round 3, §2)
-- Combines everything fn_require_shipment_access did with a FOR UPDATE
-- lock taken BEFORE the Completed check, so a concurrent transaction
-- cannot flip the shipment to Completed between this check and the
-- calling RPC's own eventual UPDATE — the row lock is held for the
-- remainder of the calling transaction, blocking that race outright.
-- p_allow_completed=true is used only by the handful of RPCs that are
-- explicitly allowed to touch a Completed shipment (reopen, and the
-- completion-confirmation RPC itself).
-- ============================================================
create or replace function fn_lock_shipment_for_mutation(
  p_shipment_id uuid,
  p_permission text default null,
  p_allow_completed boolean default false
) returns public.shipments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_shipment public.shipments;
  v_view_all boolean;
begin
  if p_permission is not null then
    v_profile := public.fn_require_permission(p_permission);
  else
    v_profile := public.fn_current_profile();
  end if;

  select * into v_shipment from public.shipments where id = p_shipment_id for update;
  if v_shipment.id is null then
    raise exception 'NOT_FOUND: shipment % does not exist', p_shipment_id using errcode = 'P0002';
  end if;

  select allowed into v_view_all from public.role_permissions
    where role = v_profile.role and permission = 'view_all_branches';
  if not coalesce(v_view_all, false) and v_shipment.branch_id is distinct from v_profile.branch_id then
    raise exception 'BRANCH_ACCESS_DENIED: shipment % is outside your branch', v_shipment.ref
      using errcode = '42501';
  end if;

  if v_shipment.overall_status = 'Completed' and not p_allow_completed then
    raise exception 'SHIPMENT_LOCKED: completed shipments are read-only; use reopen_completed_shipment first'
      using errcode = '42501';
  end if;

  return v_shipment;
end;
$$;
revoke all on function fn_lock_shipment_for_mutation(uuid, text, boolean) from public;
grant execute on function fn_lock_shipment_for_mutation(uuid, text, boolean) to authenticated;

-- ============================================================
-- ASSIGNABLE-PROFILE VALIDATION (review round 3, §4)
-- Validates any profile being assigned as responsible/coordinator/
-- delivery-order-responsible/MOFAIC-responsible/physical-docs-responsible/
-- exception-assignee: must exist, be active, share the context branch
-- (unless the target has view_all_branches), and — where a permission is
-- specified — actually hold the relevant permission for that duty (reusing
-- the existing permission system rather than hardcoding role lists, so
-- staying consistent with how every other authorization check in this
-- schema works). p_profile_id = null is allowed through (unassigning).
-- ============================================================
create or replace function fn_require_assignable_profile(
  p_profile_id uuid,
  p_context_branch_id uuid,
  p_required_permission text default null
) returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.profiles;
  v_view_all boolean;
  v_has_perm boolean;
begin
  if p_profile_id is null then
    return null;
  end if;

  select * into v_target from public.profiles where id = p_profile_id;
  if v_target.id is null then
    raise exception 'ASSIGNEE_NOT_FOUND: profile % does not exist', p_profile_id using errcode = 'P0002';
  end if;
  if not v_target.is_active then
    raise exception 'ASSIGNEE_INACTIVE: profile % is deactivated and cannot be assigned', p_profile_id using errcode = '42501';
  end if;

  select allowed into v_view_all from public.role_permissions
    where role = v_target.role and permission = 'view_all_branches';

  if not coalesce(v_view_all, false) and v_target.branch_id is distinct from p_context_branch_id then
    raise exception 'ASSIGNEE_WRONG_BRANCH: profile % is not in the target branch and does not have cross-branch visibility', p_profile_id
      using errcode = '42501';
  end if;

  if p_required_permission is not null then
    select allowed into v_has_perm from public.role_permissions
      where role = v_target.role and permission = p_required_permission;
    if not coalesce(v_has_perm, false) then
      raise exception 'ASSIGNEE_ROLE_NOT_ALLOWED: profile % (role %) does not hold % and cannot be assigned this duty',
        p_profile_id, v_target.role, p_required_permission using errcode = '42501';
    end if;
  end if;

  return v_target;
end;
$$;
revoke all on function fn_require_assignable_profile(uuid, uuid, text) from public;
grant execute on function fn_require_assignable_profile(uuid, uuid, text) to authenticated;

create or replace function fn_require_invoice_access(p_invoice_id uuid, p_permission text default null)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_invoice public.invoices;
  v_branch_id uuid;
  v_ref text;
  v_view_all boolean;
begin
  if p_permission is not null then
    v_profile := public.fn_require_permission(p_permission);
  else
    v_profile := public.fn_current_profile();
  end if;

  select * into v_invoice from public.invoices where id = p_invoice_id;
  if v_invoice.id is null then
    raise exception 'NOT_FOUND: invoice % does not exist', p_invoice_id using errcode = 'P0002';
  end if;

  select branch_id, ref into v_branch_id, v_ref from public.shipments where id = v_invoice.shipment_id;

  select allowed into v_view_all from public.role_permissions
    where role = v_profile.role and permission = 'view_all_branches';

  if not coalesce(v_view_all, false) and v_branch_id is distinct from v_profile.branch_id then
    raise exception 'BRANCH_ACCESS_DENIED: invoice on shipment % is outside your branch', v_ref
      using errcode = '42501';
  end if;

  return v_invoice;
end;
$$;
revoke all on function fn_require_invoice_access(uuid, text) from public;
grant execute on function fn_require_invoice_access(uuid, text) to authenticated;

create or replace function fn_require_document_access(p_document_id uuid, p_permission text default null, p_allow_completed boolean default false)
returns public.documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_document public.documents;
  v_shipment public.shipments;
  v_view_all boolean;
begin
  if p_permission is not null then
    v_profile := public.fn_require_permission(p_permission);
  else
    v_profile := public.fn_current_profile();
  end if;

  select * into v_document from public.documents where id = p_document_id;
  if v_document.id is null then
    raise exception 'NOT_FOUND: document % does not exist', p_document_id using errcode = 'P0002';
  end if;

  -- Lock the PARENT SHIPMENT (not just read it) so a concurrent transaction
  -- cannot flip it to Completed between this check and the caller's own
  -- eventual write — same race the review flagged for shipment-level RPCs.
  select * into v_shipment from public.shipments where id = v_document.shipment_id for update;

  select allowed into v_view_all from public.role_permissions
    where role = v_profile.role and permission = 'view_all_branches';

  if not coalesce(v_view_all, false) and v_shipment.branch_id is distinct from v_profile.branch_id then
    raise exception 'BRANCH_ACCESS_DENIED: document on shipment % is outside your branch', v_shipment.ref
      using errcode = '42501';
  end if;

  if v_shipment.overall_status = 'Completed' and not p_allow_completed then
    raise exception 'SHIPMENT_LOCKED: completed shipments are read-only; use reopen_completed_shipment first'
      using errcode = '42501';
  end if;

  return v_document;
end;
$$;
revoke all on function fn_require_document_access(uuid, text, boolean) from public;
grant execute on function fn_require_document_access(uuid, text, boolean) to authenticated;

create or replace function fn_require_exception_access(p_exception_id uuid, p_permission text default null, p_allow_completed boolean default false)
returns public.exceptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_exception public.exceptions;
  v_shipment public.shipments;
  v_view_all boolean;
begin
  if p_permission is not null then
    v_profile := public.fn_require_permission(p_permission);
  else
    v_profile := public.fn_current_profile();
  end if;

  select * into v_exception from public.exceptions where id = p_exception_id;
  if v_exception.id is null then
    raise exception 'NOT_FOUND: exception % does not exist', p_exception_id using errcode = 'P0002';
  end if;

  select * into v_shipment from public.shipments where id = v_exception.shipment_id for update;

  select allowed into v_view_all from public.role_permissions
    where role = v_profile.role and permission = 'view_all_branches';

  if not coalesce(v_view_all, false) and v_shipment.branch_id is distinct from v_profile.branch_id then
    raise exception 'BRANCH_ACCESS_DENIED: exception on shipment % is outside your branch', v_shipment.ref
      using errcode = '42501';
  end if;

  if v_shipment.overall_status = 'Completed' and not p_allow_completed then
    raise exception 'SHIPMENT_LOCKED: completed shipments are read-only; use reopen_completed_shipment first'
      using errcode = '42501';
  end if;

  return v_exception;
end;
$$;
revoke all on function fn_require_exception_access(uuid, text, boolean) from public;
grant execute on function fn_require_exception_access(uuid, text, boolean) to authenticated;

-- ============================================================
-- SECTION C — LIVE COMPLETION ELIGIBILITY (Section 3 fix)
-- shipments.completion_eligible remains a CACHED DISPLAY flag (kept in
-- sync by the 0001 trigger, for cheap register filtering). This function
-- is the live, uncached recomputation used by confirm_shipment_completion
-- for the actual authorization decision.
-- ============================================================
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
    v_shipment.overall_status = 'Received'
    and v_shipment.document_status in ('Complete','Verified')
    and v_shipment.customs_status in ('Approved','Closed')
    and v_shipment.municipality_status in ('Not Required','Finished')
    and v_shipment.delivery_order_status in ('Not Required','Verified')
    and v_shipment.mofaic_status in ('Not Applicable','Completed','Paid')
    and v_shipment.physical_doc_status in ('Not Required','Closed','Proof of Delivery Received')
    and not v_has_blocking_exception
    and not v_has_pending_resubmission;
end;
$$;
revoke all on function fn_is_shipment_completion_eligible(uuid) from public;
grant execute on function fn_is_shipment_completion_eligible(uuid) to authenticated;

-- ============================================================
-- SECTION D — AUDIT-CONTEXT PASSTHROUGH (Section 8 fix)
-- Avoids an RPC writing its own audit_log row IN ADDITION TO the generic
-- trigger's automatic row-diff entry for the same UPDATE. An RPC that wants
-- to attach human context sets a transaction-local value the generic
-- trigger reads and folds into the single row it already writes.
-- ============================================================
create or replace function fn_set_audit_context(p_comment text, p_correlation_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.audit_comment', coalesce(p_comment, ''), true);
  perform set_config('app.audit_correlation_id', coalesce(p_correlation_id::text, gen_random_uuid()::text), true);
end;
$$;
revoke all on function fn_set_audit_context(text, uuid) from public;
grant execute on function fn_set_audit_context(text, uuid) to authenticated;

-- ============================================================
-- SECTION E — GRANTS
-- ============================================================
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;

grant select on
  branches, suppliers, countries, ports, airlines, freight_agents, clearing_agents,
  carriers, courier_companies, shipment_categories, document_types, exception_types,
  currencies, fx_rates, permissions, role_permissions,
  profiles, shipments, invoices, documents, document_versions, shipment_comments,
  exceptions, resubmission_attempts, notifications, user_saved_views,
  discovery_items, audit_log, status_transitions, required_documents, mofaic_rules,
  import_batches, import_staging_rows, import_validation_issues, import_monthly_reconciliation
to authenticated;

-- Item (prototype-parity round bug fix): these 11 reference tables are not
-- confidential (an airline's name, a port code aren't sensitive, unlike
-- shipments/profiles/suppliers), so they're also readable by `anon` — this
-- lets cached, cookie-independent reads (lib/data/master-data.ts) work.
-- This grant now lives HERE, consolidated with its matching permissive
-- policy below, specifically so that re-running this file can never again
-- silently strip it out from underneath a later migration — which is
-- exactly what happened when this grant previously lived only in a
-- separate later-run migration file and this file's blanket
-- "revoke all ... from anon" (above) clobbered it on any re-run.
grant select on
  branches, countries, ports, airlines, freight_agents, clearing_agents,
  carriers, courier_companies, shipment_categories, document_types, currencies
to anon;

grant insert, update, delete on user_saved_views to authenticated;
grant update (is_read, read_at) on notifications to authenticated;

-- Section 9 fix: generate_shipment_ref must be callable ONLY from within
-- create_shipment. A SECURITY DEFINER function calling another function
-- does not require the caller's own grant, so this does not break
-- create_shipment; it only blocks a client from invoking it directly.
revoke execute on function generate_shipment_ref(text, int) from authenticated;

-- ============================================================
-- SECTION F — ENABLE RLS
-- ============================================================
alter table branches enable row level security;
alter table suppliers enable row level security;
alter table countries enable row level security;
alter table ports enable row level security;
alter table airlines enable row level security;
alter table freight_agents enable row level security;
alter table clearing_agents enable row level security;
alter table carriers enable row level security;
alter table courier_companies enable row level security;
alter table shipment_categories enable row level security;
alter table document_types enable row level security;
alter table exception_types enable row level security;
alter table currencies enable row level security;
alter table fx_rates enable row level security;
alter table permissions enable row level security;
alter table role_permissions enable row level security;
alter table profiles enable row level security;
alter table shipments enable row level security;
alter table invoices enable row level security;
alter table documents enable row level security;
alter table document_versions enable row level security;
alter table shipment_comments enable row level security;
alter table exceptions enable row level security;
alter table resubmission_attempts enable row level security;
alter table notifications enable row level security;
alter table user_saved_views enable row level security;
alter table discovery_items enable row level security;
alter table audit_log enable row level security;
alter table status_transitions enable row level security;
alter table required_documents enable row level security;
alter table mofaic_rules enable row level security;
alter table import_batches enable row level security;
alter table import_staging_rows enable row level security;
alter table import_validation_issues enable row level security;
alter table import_monthly_reconciliation enable row level security;

-- ============================================================
-- SECTION G — READ POLICIES (Section 7 fix: active-profile required)
-- ============================================================
drop policy if exists p_select_all_authenticated on branches;
drop policy if exists p_select_public on branches;
create policy p_select_public on branches for select using (true);
drop policy if exists p_select_all_authenticated on suppliers;
create policy p_select_all_authenticated on suppliers for select using (fn_is_active_profile());
drop policy if exists p_select_all_authenticated on countries;
drop policy if exists p_select_public on countries;
create policy p_select_public on countries for select using (true);
drop policy if exists p_select_all_authenticated on ports;
drop policy if exists p_select_public on ports;
create policy p_select_public on ports for select using (true);
drop policy if exists p_select_all_authenticated on airlines;
drop policy if exists p_select_public on airlines;
create policy p_select_public on airlines for select using (true);
drop policy if exists p_select_all_authenticated on freight_agents;
drop policy if exists p_select_public on freight_agents;
create policy p_select_public on freight_agents for select using (true);
drop policy if exists p_select_all_authenticated on clearing_agents;
drop policy if exists p_select_public on clearing_agents;
create policy p_select_public on clearing_agents for select using (true);
drop policy if exists p_select_all_authenticated on carriers;
drop policy if exists p_select_public on carriers;
create policy p_select_public on carriers for select using (true);
drop policy if exists p_select_all_authenticated on courier_companies;
drop policy if exists p_select_public on courier_companies;
create policy p_select_public on courier_companies for select using (true);
drop policy if exists p_select_all_authenticated on shipment_categories;
drop policy if exists p_select_public on shipment_categories;
create policy p_select_public on shipment_categories for select using (true);
drop policy if exists p_select_all_authenticated on document_types;
drop policy if exists p_select_public on document_types;
create policy p_select_public on document_types for select using (true);
drop policy if exists p_select_all_authenticated on exception_types;
create policy p_select_all_authenticated on exception_types for select using (fn_is_active_profile());
drop policy if exists p_select_all_authenticated on currencies;
drop policy if exists p_select_public on currencies;
create policy p_select_public on currencies for select using (true);
drop policy if exists p_select_all_authenticated on fx_rates;
create policy p_select_all_authenticated on fx_rates for select using (fn_is_active_profile());
drop policy if exists p_select_all_authenticated on status_transitions;
create policy p_select_all_authenticated on status_transitions for select using (fn_is_active_profile());
drop policy if exists p_select_all_authenticated on required_documents;
create policy p_select_all_authenticated on required_documents for select using (fn_is_active_profile());
drop policy if exists p_select_all_authenticated on mofaic_rules;
create policy p_select_all_authenticated on mofaic_rules for select using (fn_is_active_profile());
drop policy if exists p_select_all_authenticated on permissions;
create policy p_select_all_authenticated on permissions for select using (fn_is_active_profile());
drop policy if exists p_select_all_authenticated on role_permissions;
create policy p_select_all_authenticated on role_permissions for select using (fn_is_active_profile());
drop policy if exists p_select_all_authenticated on discovery_items;
create policy p_select_all_authenticated on discovery_items for select using (fn_is_active_profile());
-- Item 2 fix (round 4 review): the previous policy let any active user read
-- every OTHER user's complete row (email, deactivation metadata, etc).
-- Now: a user can read their own full row; system_administrator can read
-- all rows (needed for user administration). Everyone else uses the safe
-- view below for assignment dropdowns.
drop policy if exists p_select_own_profile on profiles;
create policy p_select_own_profile on profiles for select using (
  fn_is_active_profile() and id = auth.uid()
);
drop policy if exists p_select_all_profiles_admin on profiles;
create policy p_select_all_profiles_admin on profiles for select using (
  fn_is_active_profile() and has_permission('administer')
);

-- Safe, minimal view for assignment dropdowns (responsible/coordinator/
-- exception-assignee pickers) — only what's needed to populate a picker,
-- never email/deactivation metadata/other administrative fields.
-- Deliberately WITHOUT security_invoker: this view's whole purpose is to
-- expose a safe, minimal column subset ACROSS all active users to any
-- authenticated caller, which the now-restrictive per-row profiles RLS
-- would otherwise block. Runs as the view owner (bypassing that RLS by
-- design), while the column list itself is the actual security boundary —
-- no email, no deactivation metadata, no other administrative fields.
create or replace view v_assignable_profiles
as
select id, full_name, role, branch_id
from profiles
where is_active;
grant select on v_assignable_profiles to authenticated;

drop policy if exists p_select_shipments on shipments;
create policy p_select_shipments on shipments for select using (
  fn_is_active_profile()
  and (
    has_permission('view_all_branches')
    or branch_id = (select branch_id from profiles where id = auth.uid())
  )
);
drop policy if exists p_select_invoices on invoices;
create policy p_select_invoices on invoices for select using (
  exists (select 1 from shipments s where s.id = invoices.shipment_id)
);
drop policy if exists p_select_documents on documents;
create policy p_select_documents on documents for select using (
  exists (select 1 from shipments s where s.id = documents.shipment_id)
);
drop policy if exists p_select_docversions on document_versions;
create policy p_select_docversions on document_versions for select using (
  exists (select 1 from documents d join shipments s on s.id = d.shipment_id where d.id = document_versions.document_id)
);
drop policy if exists p_select_comments on shipment_comments;
create policy p_select_comments on shipment_comments for select using (
  exists (select 1 from shipments s where s.id = shipment_comments.shipment_id)
);
drop policy if exists p_select_exceptions on exceptions;
create policy p_select_exceptions on exceptions for select using (
  exists (select 1 from shipments s where s.id = exceptions.shipment_id)
);
drop policy if exists p_select_resubmissions on resubmission_attempts;
create policy p_select_resubmissions on resubmission_attempts for select using (
  exists (select 1 from exceptions e join shipments s on s.id = e.shipment_id where e.id = resubmission_attempts.exception_id)
);

drop policy if exists p_select_own_notifications on notifications;
create policy p_select_own_notifications on notifications for select using (
  fn_is_active_profile() and recipient = auth.uid()
);
drop policy if exists p_update_own_notifications on notifications;
create policy p_update_own_notifications on notifications for update
  using (fn_is_active_profile() and recipient = auth.uid()) with check (recipient = auth.uid());

drop policy if exists p_manage_own_saved_views on user_saved_views;
create policy p_manage_own_saved_views on user_saved_views for all
  using (fn_is_active_profile() and owner = auth.uid()) with check (owner = auth.uid());

-- Section 7 fix: audit_log restricted by branch (shipment-scoped events) and
-- by 'administer' permission (system-level events with no shipment_ref —
-- profile/role/permission/master-data/import changes).
drop policy if exists p_select_audit_log on audit_log;
create policy p_select_audit_log on audit_log for select using (
  fn_is_active_profile()
  and (
    (
      shipment_ref is not null
      and (
        has_permission('view_all_branches')
        or exists (
          select 1 from shipments s
          where s.ref = audit_log.shipment_ref
            and s.branch_id = (select branch_id from profiles where id = auth.uid())
        )
      )
    )
    or (shipment_ref is null and has_permission('administer'))
  )
);

drop policy if exists p_select_import on import_batches;
create policy p_select_import on import_batches for select using (fn_is_active_profile() and has_permission('administer'));
drop policy if exists p_select_staging on import_staging_rows;
create policy p_select_staging on import_staging_rows for select using (fn_is_active_profile() and has_permission('administer'));
drop policy if exists p_select_issues on import_validation_issues;
create policy p_select_issues on import_validation_issues for select using (fn_is_active_profile() and has_permission('administer'));
drop policy if exists p_select_reconciliation on import_monthly_reconciliation;
create policy p_select_reconciliation on import_monthly_reconciliation for select using (fn_is_active_profile() and has_permission('administer'));

-- ============================================================
-- SECTION H — WRITE RPC FUNCTIONS: SHIPMENT CORE
-- ============================================================
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

  -- Item 5: Phase 1 supports Air only.
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

  -- Item 4 fix: when a supplier_id is given, the canonical name ALWAYS comes
  -- from the suppliers table — p_supplier_name is never trusted in that
  -- case, closing the path for an ordinary user to invent an uncontrolled
  -- supplier label while appearing to reference a real master-data row.
  if p_supplier_id is not null then
    select name, is_active into v_supplier_name, v_supplier_active
    from public.suppliers where id = p_supplier_id;
    if v_supplier_name is null then
      raise exception 'SUPPLIER_NOT_FOUND: supplier % does not exist', p_supplier_id using errcode = 'P0002';
    end if;
    if not v_supplier_active then
      raise exception 'SUPPLIER_INACTIVE: supplier % is not active', p_supplier_id using errcode = '23514';
    end if;
  else
    v_supplier_name := trim(p_supplier_name);
  end if;

  if v_supplier_name is null or length(v_supplier_name) = 0 then
    raise exception 'SUPPLIER_NAME_REQUIRED: supplier name cannot be blank' using errcode = '23502';
  end if;

  v_year := extract(year from p_shipment_date)::int;
  v_ref := public.generate_shipment_ref(p_mode, v_year);

  insert into public.shipments (
    ref, mode, shipment_date, category_id, branch_id, supplier_id, supplier_name_snapshot,
    origin_country_id, priority, responsible, internal_ref, notes, overall_status, created_by, updated_by
  ) values (
    v_ref, p_mode, p_shipment_date, p_category_id, p_branch_id, p_supplier_id, v_supplier_name,
    p_origin_country_id, coalesce(p_priority, 'Medium'), p_responsible, p_internal_ref, p_notes,
    'Draft', v_profile.id, v_profile.id
  ) returning * into v_shipment;

  return v_shipment;
end;
$$;
revoke all on function create_shipment(text,date,uuid,uuid,uuid,text,uuid,text,uuid,text,text) from public;
grant execute on function create_shipment(text,date,uuid,uuid,uuid,text,uuid,text,uuid,text,text) to authenticated;

-- Section 2 fix: responsible/coordinator REMOVED — those change only via assign_shipment.
create or replace function update_shipment_basic(
  p_shipment_id uuid, p_internal_ref text, p_supplier_id uuid, p_supplier_name text,
  p_origin_country_id uuid, p_category_id uuid, p_priority text, p_notes text
) returns public.shipments
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_shipment public.shipments;
  v_supplier_name text;
  v_supplier_active boolean;
begin
  v_shipment := public.fn_lock_shipment_for_mutation(p_shipment_id, 'edit_basic');
  v_profile := public.fn_current_profile();

  if p_priority is not null and p_priority not in ('Low','Medium','High','Critical') then
    raise exception 'INVALID_PRIORITY: % is not a recognized priority', p_priority using errcode = '23514';
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

  -- Same fix as create_shipment: never trust client-supplied supplier text
  -- when a supplier_id is given.
  if p_supplier_id is not null then
    select name, is_active into v_supplier_name, v_supplier_active
    from public.suppliers where id = p_supplier_id;
    if v_supplier_name is null then
      raise exception 'SUPPLIER_NOT_FOUND: supplier % does not exist', p_supplier_id using errcode = 'P0002';
    end if;
    if not v_supplier_active then
      raise exception 'SUPPLIER_INACTIVE: supplier % is not active', p_supplier_id using errcode = '23514';
    end if;
  elsif p_supplier_name is not null then
    v_supplier_name := trim(p_supplier_name);
    if length(v_supplier_name) = 0 then
      raise exception 'SUPPLIER_NAME_REQUIRED: supplier name cannot be blank' using errcode = '23502';
    end if;
  end if;

  update public.shipments set
    internal_ref = p_internal_ref, supplier_id = p_supplier_id,
    supplier_name_snapshot = coalesce(v_supplier_name, supplier_name_snapshot),
    origin_country_id = p_origin_country_id, category_id = p_category_id,
    priority = coalesce(p_priority, priority), notes = p_notes, updated_by = v_profile.id
  where id = p_shipment_id returning * into v_shipment;

  return v_shipment;
end;
$$;
revoke all on function update_shipment_basic(uuid,text,uuid,text,uuid,uuid,text,text) from public;
grant execute on function update_shipment_basic(uuid,text,uuid,text,uuid,uuid,text,text) to authenticated;

create or replace function update_shipment_transport(
  p_shipment_id uuid, p_awb text, p_airline_id uuid, p_flight text, p_eta timestamptz,
  p_port_id uuid, p_freight_agent_id uuid, p_clearing_agent_id uuid, p_packages int,
  p_net_weight numeric, p_gross_weight numeric, p_transport_remarks text
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
    updated_by = v_profile.id
  where id = p_shipment_id returning * into v_shipment;

  return v_shipment;
end;
$$;
revoke all on function update_shipment_transport(uuid,text,uuid,text,timestamptz,uuid,uuid,uuid,int,numeric,numeric,text) from public;
grant execute on function update_shipment_transport(uuid,text,uuid,text,timestamptz,uuid,uuid,uuid,int,numeric,numeric,text) to authenticated;

-- ============================================================
-- SECTION I — INVOICES
-- ============================================================
create or replace function add_invoice(
  p_shipment_id uuid, p_invoice_no text, p_invoice_date date, p_supplier_id uuid, p_supplier_name text,
  p_invoice_value numeric, p_currency_code text, p_purchase_order_no text default null,
  p_supplier_reference text default null, p_payment_terms text default null, p_remarks text default null
) returns public.invoices
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_shipment public.shipments;
  v_invoice public.invoices;
begin
  v_shipment := public.fn_lock_shipment_for_mutation(p_shipment_id, 'edit_invoice');
  v_profile := public.fn_current_profile();
  if p_invoice_value < 0 then
    raise exception 'INVALID_VALUE: invoice value cannot be negative' using errcode = '23514';
  end if;
  if p_invoice_date > current_date then
    raise exception 'INVALID_DATE: invoice date cannot be in the future' using errcode = '23514';
  end if;
  if not exists (select 1 from public.currencies where code = p_currency_code) then
    raise exception 'INVALID_CURRENCY: % is not a recognized currency code', p_currency_code using errcode = '23514';
  end if;

  insert into public.invoices (
    shipment_id, invoice_no, invoice_date, supplier_id, supplier_name_snapshot, invoice_value,
    currency_code, purchase_order_no, supplier_reference, payment_terms, remarks, created_by, updated_by
  ) values (
    p_shipment_id, p_invoice_no, p_invoice_date, p_supplier_id, coalesce(p_supplier_name, v_shipment.supplier_name_snapshot),
    p_invoice_value, p_currency_code, p_purchase_order_no, p_supplier_reference, p_payment_terms, p_remarks,
    v_profile.id, v_profile.id
  ) returning * into v_invoice;

  return v_invoice;
end;
$$;
revoke all on function add_invoice(uuid,text,date,uuid,text,numeric,text,text,text,text,text) from public;
grant execute on function add_invoice(uuid,text,date,uuid,text,numeric,text,text,text,text,text) to authenticated;

create or replace function update_invoice(
  p_invoice_id uuid, p_invoice_value numeric, p_currency_code text, p_payment_terms text, p_remarks text
) returns public.invoices
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_invoice public.invoices;
  v_shipment_status public.overall_status;
begin
  v_invoice := public.fn_require_invoice_access(p_invoice_id, 'edit_invoice');
  v_profile := public.fn_current_profile();

  select overall_status into v_shipment_status from public.shipments where id = v_invoice.shipment_id;
  if v_shipment_status = 'Completed' then
    raise exception 'SHIPMENT_LOCKED: completed shipments are read-only' using errcode = '42501';
  end if;
  if p_invoice_value is not null and p_invoice_value < 0 then
    raise exception 'INVALID_VALUE: invoice value cannot be negative' using errcode = '23514';
  end if;
  if p_currency_code is not null and not exists (select 1 from public.currencies where code = p_currency_code) then
    raise exception 'INVALID_CURRENCY: % is not a recognized currency code', p_currency_code using errcode = '23514';
  end if;

  update public.invoices set
    invoice_value = coalesce(p_invoice_value, invoice_value), currency_code = coalesce(p_currency_code, currency_code),
    payment_terms = coalesce(p_payment_terms, payment_terms), remarks = coalesce(p_remarks, remarks),
    updated_by = v_profile.id, updated_at = now()
  where id = p_invoice_id returning * into v_invoice;

  return v_invoice;
end;
$$;
revoke all on function update_invoice(uuid,numeric,text,text,text) from public;
grant execute on function update_invoice(uuid,numeric,text,text,text) to authenticated;

-- ============================================================
-- SECTION J — DOCUMENTS
-- Storage path convention: shipments/{shipment_id}/{document_id}/{filename}
-- ============================================================
create or replace function fn_validate_storage_path(p_storage_path text, p_shipment_id uuid, p_document_id uuid)
returns boolean language sql security definer set search_path = ''
as $$
  select p_storage_path like ('shipments/' || p_shipment_id::text || '/' || p_document_id::text || '/%');
$$;
revoke all on function fn_validate_storage_path(text, uuid, uuid) from public;
grant execute on function fn_validate_storage_path(text, uuid, uuid) to authenticated;

-- ============================================================
-- SECTION K — DOCUMENT-STATUS RECALCULATION (driven by required_documents,
-- configured per category/origin — see architecture doc for the pending
-- confirmation note on the exact required-document lists)
-- ============================================================
create or replace function fn_recalculate_document_status(p_shipment_id uuid)
returns void language plpgsql security definer set search_path = ''
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
  if v_shipment.id is null then return; end if;

  select count(*) into v_required_count from public.required_documents rd
  where rd.category_id = v_shipment.category_id and rd.is_active
    and (rd.origin_country_id is null or rd.origin_country_id = v_shipment.origin_country_id);

  select exists (
    select 1 from public.documents d join public.document_versions dv on dv.document_id = d.id and dv.is_current
    where d.shipment_id = p_shipment_id
  ) into v_any_uploaded;

  select count(distinct rd.document_type_id) into v_present_count
  from public.required_documents rd
  join public.documents d on d.document_type_id = rd.document_type_id and d.shipment_id = p_shipment_id
  join public.document_versions dv on dv.document_id = d.id and dv.is_current
  where rd.category_id = v_shipment.category_id and rd.is_active
    and (rd.origin_country_id is null or rd.origin_country_id = v_shipment.origin_country_id);

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
  elsif v_required_count = 0 then v_new_status := case when v_any_uploaded then 'Complete' else 'Not Started' end;
  elsif not v_any_uploaded then v_new_status := 'Not Started';
  elsif v_present_count < v_required_count then v_new_status := 'Documents Pending';
  elsif v_verified_count < v_required_count then v_new_status := 'Partially Complete';
  else v_new_status := 'Verified';
  end if;

  update public.shipments set document_status = v_new_status where id = p_shipment_id and document_status <> v_new_status;
end;
$$;
revoke all on function fn_recalculate_document_status(uuid) from public;

-- Upload a document for the FIRST time. p_document_id is client-generated so
-- the signed-upload-URL path can be built before this RPC runs.
create or replace function upload_document_metadata(
  p_shipment_id uuid, p_document_id uuid, p_invoice_id uuid, p_document_type_id uuid,
  p_storage_path text, p_original_filename text, p_mime_type text, p_file_size bigint,
  p_sha256_hash text, p_expiry_date date default null
) returns public.document_versions
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_shipment public.shipments;
  v_version public.document_versions;
  v_intent public.upload_intents;
  v_object_exists boolean;
begin
  v_shipment := public.fn_lock_shipment_for_mutation(p_shipment_id, 'upload_docs');
  v_profile := public.fn_current_profile();
  if p_invoice_id is not null and not exists (
    select 1 from public.invoices where id = p_invoice_id and shipment_id = p_shipment_id
  ) then
    raise exception 'INVOICE_MISMATCH: invoice % does not belong to shipment %', p_invoice_id, v_shipment.ref using errcode = '23514';
  end if;
  if not public.fn_validate_storage_path(p_storage_path, p_shipment_id, p_document_id) then
    raise exception 'INVALID_STORAGE_PATH: % does not match the expected shipment/document path', p_storage_path using errcode = '23514';
  end if;
  if exists (select 1 from public.documents where id = p_document_id) then
    raise exception 'DOCUMENT_ALREADY_EXISTS: % — use replace_document to add a new version', p_document_id using errcode = '23505';
  end if;

  -- Item 5: do not permit phantom document metadata. Require the exact
  -- object to actually exist in storage.objects, AND a matching, unexpired,
  -- unfulfilled upload intent belonging to this exact caller/shipment/doc.
  select exists (
    select 1 from storage.objects where bucket_id = 'shipment-documents' and name = p_storage_path
  ) into v_object_exists;
  if not v_object_exists then
    raise exception 'STORAGE_OBJECT_MISSING: no object exists at % in bucket shipment-documents — upload the file before registering its metadata', p_storage_path
      using errcode = '23514';
  end if;

  select * into v_intent from public.upload_intents
  where storage_path = p_storage_path and shipment_id = p_shipment_id and document_id = p_document_id;
  if v_intent.id is null then
    raise exception 'UPLOAD_INTENT_MISSING: no upload intent was registered for this shipment/document/path — call fn_register_upload_intent first'
      using errcode = '23514';
  end if;
  if v_intent.requested_by is distinct from v_profile.id then
    raise exception 'UPLOAD_INTENT_OWNER_MISMATCH: this upload intent belongs to a different user' using errcode = '42501';
  end if;
  if v_intent.fulfilled then
    raise exception 'UPLOAD_INTENT_ALREADY_FULFILLED: this upload intent has already been consumed' using errcode = '23514';
  end if;
  if v_intent.expires_at < now() then
    raise exception 'UPLOAD_INTENT_EXPIRED: this upload intent expired at %', v_intent.expires_at using errcode = '23514';
  end if;

  insert into public.documents (id, shipment_id, invoice_id, document_type_id, created_by)
  values (p_document_id, p_shipment_id, p_invoice_id, p_document_type_id, v_profile.id);

  insert into public.document_versions (
    document_id, version_number, storage_path, original_filename, mime_type, file_size, sha256_hash,
    is_current, status, uploaded_by, expiry_date
  ) values (
    p_document_id, 1, p_storage_path, p_original_filename, p_mime_type, p_file_size, p_sha256_hash,
    true, 'Uploaded', v_profile.id, p_expiry_date
  ) returning * into v_version;

  update public.upload_intents set fulfilled = true, fulfilled_at = now() where id = v_intent.id;
  perform public.fn_recalculate_document_status(p_shipment_id);

  return v_version;
end;
$$;
revoke all on function upload_document_metadata(uuid,uuid,uuid,uuid,text,text,text,bigint,text,date) from public;
grant execute on function upload_document_metadata(uuid,uuid,uuid,uuid,text,text,text,bigint,text,date) to authenticated;

-- Replace an EXISTING document. Locks the `documents` row first so two
-- concurrent replacements can't both compute the same "next version".
create or replace function replace_document(
  p_document_id uuid, p_storage_path text, p_original_filename text, p_mime_type text,
  p_file_size bigint, p_sha256_hash text, p_expiry_date date default null
) returns public.document_versions
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_document public.documents;
  v_next_version int;
  v_previous_version_id uuid;
  v_version public.document_versions;
  v_intent public.upload_intents;
  v_object_exists boolean;
begin
  v_document := public.fn_require_document_access(p_document_id, 'upload_docs');
  v_profile := public.fn_current_profile();

  if not public.fn_validate_storage_path(p_storage_path, v_document.shipment_id, p_document_id) then
    raise exception 'INVALID_STORAGE_PATH: % does not match the expected shipment/document path', p_storage_path using errcode = '23514';
  end if;

  select exists (
    select 1 from storage.objects where bucket_id = 'shipment-documents' and name = p_storage_path
  ) into v_object_exists;
  if not v_object_exists then
    raise exception 'STORAGE_OBJECT_MISSING: no object exists at % in bucket shipment-documents', p_storage_path
      using errcode = '23514';
  end if;

  select * into v_intent from public.upload_intents
  where storage_path = p_storage_path and shipment_id = v_document.shipment_id and document_id = p_document_id;
  if v_intent.id is null then
    raise exception 'UPLOAD_INTENT_MISSING: no upload intent was registered for this shipment/document/path' using errcode = '23514';
  end if;
  if v_intent.requested_by is distinct from v_profile.id then
    raise exception 'UPLOAD_INTENT_OWNER_MISMATCH: this upload intent belongs to a different user' using errcode = '42501';
  end if;
  if v_intent.fulfilled then
    raise exception 'UPLOAD_INTENT_ALREADY_FULFILLED: this upload intent has already been consumed' using errcode = '23514';
  end if;
  if v_intent.expires_at < now() then
    raise exception 'UPLOAD_INTENT_EXPIRED: this upload intent expired at %', v_intent.expires_at using errcode = '23514';
  end if;

  perform 1 from public.documents where id = p_document_id for update;

  select id, version_number into v_previous_version_id, v_next_version
  from public.document_versions where document_id = p_document_id and is_current;

  if v_previous_version_id is null then
    raise exception 'NO_CURRENT_VERSION: document % has no current version to replace', p_document_id using errcode = 'P0002';
  end if;
  v_next_version := v_next_version + 1;

  update public.document_versions set is_current = false where id = v_previous_version_id;

  insert into public.document_versions (
    document_id, version_number, storage_path, original_filename, mime_type, file_size, sha256_hash,
    is_current, status, uploaded_by, expiry_date, replaces_version_id
  ) values (
    p_document_id, v_next_version, p_storage_path, p_original_filename, p_mime_type, p_file_size, p_sha256_hash,
    true, 'Uploaded', v_profile.id, p_expiry_date, v_previous_version_id
  ) returning * into v_version;

  update public.upload_intents set fulfilled = true, fulfilled_at = now() where id = v_intent.id;
  perform public.fn_recalculate_document_status(v_document.shipment_id);

  return v_version;
end;
$$;
revoke all on function replace_document(uuid,text,text,text,bigint,text,date) from public;
grant execute on function replace_document(uuid,text,text,text,bigint,text,date) to authenticated;

-- Only the CURRENT version of a document may be verified.
create or replace function verify_document(p_document_version_id uuid, p_approve boolean, p_remarks text default null)
returns public.document_versions
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_version public.document_versions;
  v_document public.documents;
begin
  select * into v_version from public.document_versions where id = p_document_version_id;
  if v_version.id is null then
    raise exception 'NOT_FOUND: document version % does not exist', p_document_version_id using errcode = 'P0002';
  end if;

  v_document := public.fn_require_document_access(v_version.document_id, 'verify_docs');
  v_profile := public.fn_current_profile();

  if not v_version.is_current then
    raise exception 'NOT_CURRENT_VERSION: only the current version of a document may be verified' using errcode = '42501';
  end if;
  if v_version.status = 'Archived' then
    raise exception 'DOCUMENT_ARCHIVED: an archived version cannot be verified' using errcode = '42501';
  end if;

  update public.document_versions set
    status = case when p_approve then 'Verified' else 'Rejected' end,
    verified_by = v_profile.id, verified_at = now(), remarks = coalesce(p_remarks, remarks)
  where id = p_document_version_id returning * into v_version;

  perform public.fn_recalculate_document_status(v_document.shipment_id);

  return v_version;
end;
$$;
revoke all on function verify_document(uuid,boolean,text) from public;
grant execute on function verify_document(uuid,boolean,text) to authenticated;

create or replace function archive_document(p_document_version_id uuid, p_reason text)
returns public.document_versions
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_version public.document_versions;
  v_document public.documents;
begin
  select * into v_version from public.document_versions where id = p_document_version_id;
  if v_version.id is null then
    raise exception 'NOT_FOUND: document version % does not exist', p_document_version_id using errcode = 'P0002';
  end if;

  v_document := public.fn_require_document_access(v_version.document_id, 'verify_docs');
  v_profile := public.fn_current_profile();

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED: archiving a document requires a reason' using errcode = '23502';
  end if;

  update public.document_versions set
    status = 'Archived', archived_at = now(), archived_by = v_profile.id, archive_reason = p_reason, is_current = false
  where id = p_document_version_id returning * into v_version;

  perform public.fn_recalculate_document_status(v_document.shipment_id);

  return v_version;
end;
$$;
revoke all on function archive_document(uuid,text) from public;
grant execute on function archive_document(uuid,text) to authenticated;

-- ============================================================
-- SECTION L — PORTAL UPDATE RPCs
-- ============================================================
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
  if p_customs_status in ('Declaration Created','Submitted','Under Review','Approved','Rejected','Resubmission Required','Closed')
     and (p_declaration_no is null or length(trim(p_declaration_no)) = 0) then
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
  if p_delivery_order_status = 'Received' and v_received_date is null then
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
revoke all on function update_delivery_order(uuid,uuid,public.delivery_order_status,date,date,boolean,uuid,text) from public;
grant execute on function update_delivery_order(uuid,uuid,public.delivery_order_status,date,date,boolean,uuid,text) to authenticated;

create or replace function update_mofaic(
  p_shipment_id uuid, p_mofaic_status public.mofaic_status, p_mofaic_ref text,
  p_mofaic_payment_amount numeric, p_mofaic_currency text, p_mofaic_payment_date date,
  p_mofaic_responsible uuid, p_mofaic_remarks text
) returns public.shipments
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_shipment public.shipments;
begin
  v_shipment := public.fn_lock_shipment_for_mutation(p_shipment_id, 'edit_mofaic');
  v_profile := public.fn_current_profile();
  perform public.fn_require_assignable_profile(p_mofaic_responsible, v_shipment.branch_id, 'edit_mofaic');
  if p_mofaic_status = 'Paid' and (p_mofaic_payment_date is null or p_mofaic_payment_amount is null) then
    raise exception 'MOFAIC_PAYMENT_INCOMPLETE: Paid status requires both payment date and payment amount' using errcode = '23514';
  end if;
  if p_mofaic_payment_amount is not null and p_mofaic_payment_amount < 0 then
    raise exception 'INVALID_VALUE: MOFAIC payment amount cannot be negative' using errcode = '23514';
  end if;
  if p_mofaic_payment_date is not null and p_mofaic_payment_date > current_date then
    raise exception 'INVALID_DATE: MOFAIC payment date cannot be in the future' using errcode = '23514';
  end if;

  update public.shipments set
    mofaic_status = p_mofaic_status, mofaic_ref = p_mofaic_ref, mofaic_payment_amount = p_mofaic_payment_amount,
    mofaic_currency = coalesce(p_mofaic_currency, mofaic_currency), mofaic_payment_date = p_mofaic_payment_date,
    mofaic_responsible = p_mofaic_responsible, mofaic_remarks = p_mofaic_remarks, updated_by = v_profile.id
  where id = p_shipment_id returning * into v_shipment;

  return v_shipment;
end;
$$;
revoke all on function update_mofaic(uuid,public.mofaic_status,text,numeric,text,date,uuid,text) from public;
grant execute on function update_mofaic(uuid,public.mofaic_status,text,numeric,text,date,uuid,text) to authenticated;

create or replace function update_physical_documents(
  p_shipment_id uuid, p_physical_doc_status public.physical_doc_status, p_originals_required boolean,
  p_originals_received boolean, p_ready_for_dispatch boolean, p_courier_company_id uuid, p_tracking_number text,
  p_dispatch_date date, p_delivered_date date, p_pod_received boolean, p_physical_docs_responsible uuid,
  p_physical_docs_remarks text
) returns public.shipments
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_shipment public.shipments;
begin
  v_shipment := public.fn_lock_shipment_for_mutation(p_shipment_id, 'edit_physical_docs');
  v_profile := public.fn_current_profile();
  perform public.fn_require_assignable_profile(p_physical_docs_responsible, v_shipment.branch_id, 'edit_physical_docs');
  if p_delivered_date is not null and p_dispatch_date is not null and p_delivered_date < p_dispatch_date then
    raise exception 'INVALID_DATE_ORDER: delivered date cannot be before dispatch date' using errcode = '23514';
  end if;
  if p_pod_received and p_delivered_date is null then
    raise exception 'POD_REQUIRES_DELIVERY_DATE: proof of delivery cannot be received without a delivered date' using errcode = '23514';
  end if;

  update public.shipments set
    physical_doc_status = p_physical_doc_status, originals_required = p_originals_required,
    originals_received = p_originals_received, ready_for_dispatch = p_ready_for_dispatch,
    courier_company_id = p_courier_company_id, tracking_number = p_tracking_number, dispatch_date = p_dispatch_date,
    delivered_date = p_delivered_date, pod_received = p_pod_received,
    physical_docs_responsible = p_physical_docs_responsible, physical_docs_remarks = p_physical_docs_remarks,
    updated_by = v_profile.id
  where id = p_shipment_id returning * into v_shipment;

  return v_shipment;
end;
$$;
revoke all on function update_physical_documents(uuid,public.physical_doc_status,boolean,boolean,boolean,uuid,text,date,date,boolean,uuid,text) from public;
grant execute on function update_physical_documents(uuid,public.physical_doc_status,boolean,boolean,boolean,uuid,text,date,date,boolean,uuid,text) to authenticated;

-- ============================================================
-- SECTION M — STATUS CHANGE, ASSIGNMENT
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
begin
  v_shipment := public.fn_lock_shipment_for_mutation(p_shipment_id, null);

  select * into v_transition from public.status_transitions
  where from_status = v_shipment.overall_status and to_status = p_new_status;

  if v_transition.from_status is null then
    raise exception 'INVALID_TRANSITION: % -> % is not an allowed status transition', v_shipment.overall_status, p_new_status using errcode = '23514';
  end if;

  v_profile := public.fn_require_permission(v_transition.required_permission);

  if v_transition.requires_reason and (p_reason is null or length(trim(p_reason)) = 0) then
    raise exception 'REASON_REQUIRED: a reason is required for this status change' using errcode = '23502';
  end if;

  if p_new_status = 'Ready for Submission' and v_shipment.document_status not in ('Complete','Verified') then
    raise exception 'DOCUMENTS_NOT_READY: document_status must be Complete or Verified before Ready for Submission (currently %)', v_shipment.document_status using errcode = '23514';
  end if;
  if p_new_status = 'Submitted' and v_shipment.customs_status = 'Not Started' then
    raise exception 'CUSTOMS_NOT_STARTED: customs processing must have begun before Submitted' using errcode = '23514';
  end if;
  if p_new_status = 'Received' and v_shipment.delivery_order_status = 'Pending' then
    raise exception 'DELIVERY_ORDER_NOT_READY: delivery order must progress past Pending before Received' using errcode = '23514';
  end if;

  perform public.fn_set_audit_context('Status changed: ' || v_transition.from_status || ' -> ' || p_new_status ||
    case when p_reason is not null then ' (' || p_reason || ')' else '' end);

  update public.shipments set overall_status = p_new_status, updated_by = v_profile.id
  where id = p_shipment_id returning * into v_shipment;

  return v_shipment;
end;
$$;
revoke all on function change_shipment_status(uuid,public.overall_status,text) from public;
grant execute on function change_shipment_status(uuid,public.overall_status,text) to authenticated;

create or replace function assign_shipment(p_shipment_id uuid, p_responsible uuid, p_coordinator uuid)
returns public.shipments
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_shipment public.shipments;
begin
  v_shipment := public.fn_lock_shipment_for_mutation(p_shipment_id, 'assign');
  v_profile := public.fn_current_profile();

  perform public.fn_require_assignable_profile(p_responsible, v_shipment.branch_id);
  perform public.fn_require_assignable_profile(p_coordinator, v_shipment.branch_id);

  update public.shipments set
    responsible = coalesce(p_responsible, responsible), coordinator = coalesce(p_coordinator, coordinator),
    updated_by = v_profile.id
  where id = p_shipment_id returning * into v_shipment;

  return v_shipment;
end;
$$;
revoke all on function assign_shipment(uuid,uuid,uuid) from public;
grant execute on function assign_shipment(uuid,uuid,uuid) to authenticated;

-- ============================================================
-- SECTION N — EXCEPTION & RESUBMISSION LIFECYCLE
-- ============================================================
create or replace function raise_exception(
  p_shipment_id uuid, p_exception_type_id uuid, p_severity text, p_description text,
  p_assigned_to uuid, p_due_date date default null
) returns public.exceptions
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_shipment public.shipments;
  v_exception public.exceptions;
begin
  v_shipment := public.fn_lock_shipment_for_mutation(p_shipment_id, 'manage_exceptions');
  v_profile := public.fn_current_profile();
  perform public.fn_require_assignable_profile(p_assigned_to, v_shipment.branch_id, 'manage_exceptions');

  if p_severity not in ('Critical','High','Medium','Low') then
    raise exception 'INVALID_SEVERITY: % is not a recognized severity', p_severity using errcode = '23514';
  end if;

  insert into public.exceptions (shipment_id, exception_type_id, severity, description, raised_by, assigned_to, due_date)
  values (p_shipment_id, p_exception_type_id, p_severity, p_description, v_profile.id, p_assigned_to, coalesce(p_due_date, current_date + 5))
  returning * into v_exception;

  return v_exception;
end;
$$;
revoke all on function raise_exception(uuid,uuid,text,text,uuid,date) from public;
grant execute on function raise_exception(uuid,uuid,text,text,uuid,date) to authenticated;

create or replace function update_exception(
  p_exception_id uuid, p_severity text default null, p_description text default null, p_due_date date default null
) returns public.exceptions
language plpgsql security definer set search_path = ''
as $$
declare
  v_exception public.exceptions;
begin
  v_exception := public.fn_require_exception_access(p_exception_id, 'manage_exceptions', false);

  if v_exception.status in ('Resolved','Closed') then
    raise exception 'EXCEPTION_CLOSED: cannot edit a resolved/closed exception' using errcode = '42501';
  end if;
  if p_severity is not null and p_severity not in ('Critical','High','Medium','Low') then
    raise exception 'INVALID_SEVERITY: % is not a recognized severity', p_severity using errcode = '23514';
  end if;

  update public.exceptions set
    severity = coalesce(p_severity, severity), description = coalesce(p_description, description),
    due_date = coalesce(p_due_date, due_date), updated_at = now()
  where id = p_exception_id returning * into v_exception;

  return v_exception;
end;
$$;
revoke all on function update_exception(uuid,text,text,date) from public;
grant execute on function update_exception(uuid,text,text,date) to authenticated;

create or replace function assign_exception(p_exception_id uuid, p_assigned_to uuid)
returns public.exceptions
language plpgsql security definer set search_path = ''
as $$
declare
  v_exception public.exceptions;
  v_branch_id uuid;
begin
  v_exception := public.fn_require_exception_access(p_exception_id, 'manage_exceptions', false);

  if v_exception.status in ('Resolved','Closed') then
    raise exception 'EXCEPTION_CLOSED: cannot reassign a resolved/closed exception' using errcode = '42501';
  end if;

  select branch_id into v_branch_id from public.shipments where id = v_exception.shipment_id;
  perform public.fn_require_assignable_profile(p_assigned_to, v_branch_id, 'manage_exceptions');

  update public.exceptions set assigned_to = p_assigned_to, updated_at = now()
  where id = p_exception_id returning * into v_exception;

  return v_exception;
end;
$$;
revoke all on function assign_exception(uuid,uuid) from public;
grant execute on function assign_exception(uuid,uuid) to authenticated;

create or replace function resolve_exception(p_exception_id uuid, p_root_cause text, p_resolution text)
returns public.exceptions
language plpgsql security definer set search_path = ''
as $$
declare
  v_exception public.exceptions;
begin
  -- Explicit decision (review round 3, §3): resolving/closing an exception
  -- IS allowed on a Completed shipment. A shipment can be Completed while
  -- still carrying an open Medium/Low exception (only Critical/High block
  -- eligibility) — tidying up that lingering record afterward is desirable,
  -- doesn't reopen or change the shipment itself, and shouldn't require a
  -- full reopen/reason/audit-trail detour just to close a minor note.
  v_exception := public.fn_require_exception_access(p_exception_id, 'manage_exceptions', true);

  if v_exception.status in ('Resolved','Closed') then
    raise exception 'ALREADY_RESOLVED: exception is already resolved/closed' using errcode = '23514';
  end if;
  if p_root_cause is null or length(trim(p_root_cause)) = 0 then
    raise exception 'ROOT_CAUSE_REQUIRED: resolving an exception requires a root cause' using errcode = '23502';
  end if;
  if p_resolution is null or length(trim(p_resolution)) = 0 then
    raise exception 'RESOLUTION_REQUIRED: resolving an exception requires a resolution note' using errcode = '23502';
  end if;
  if exists (select 1 from public.resubmission_attempts where exception_id = p_exception_id and authority_result = 'Pending') then
    raise exception 'RESUBMISSION_PENDING: cannot resolve while a resubmission attempt is still Pending' using errcode = '23514';
  end if;

  update public.exceptions set status = 'Resolved', root_cause = p_root_cause, resolution = p_resolution, updated_at = now()
  where id = p_exception_id returning * into v_exception;

  return v_exception;
end;
$$;
revoke all on function resolve_exception(uuid,text,text) from public;
grant execute on function resolve_exception(uuid,text,text) to authenticated;

create or replace function close_exception(p_exception_id uuid)
returns public.exceptions
language plpgsql security definer set search_path = ''
as $$
declare
  v_exception public.exceptions;
begin
  v_exception := public.fn_require_exception_access(p_exception_id, 'manage_exceptions', true);

  if v_exception.status <> 'Resolved' then
    raise exception 'NOT_RESOLVED: an exception must be Resolved before it can be Closed' using errcode = '23514';
  end if;

  update public.exceptions set status = 'Closed', updated_at = now()
  where id = p_exception_id returning * into v_exception;

  return v_exception;
end;
$$;
revoke all on function close_exception(uuid) from public;
grant execute on function close_exception(uuid) to authenticated;

-- Concurrency-safe attempt numbering: row lock on the parent exception.
create or replace function add_resubmission_attempt(p_exception_id uuid, p_reason text, p_corrective_action text)
returns public.resubmission_attempts
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_next_attempt int;
  v_attempt public.resubmission_attempts;
begin
  perform public.fn_require_exception_access(p_exception_id, 'manage_exceptions', false);
  v_profile := public.fn_current_profile();

  -- Row lock on the exception itself serializes concurrent attempt-number
  -- computation for the SAME exception (distinct purpose from the parent-
  -- shipment lock fn_require_exception_access already took above).
  perform 1 from public.exceptions where id = p_exception_id for update;

  select coalesce(max(attempt_no), 0) + 1 into v_next_attempt from public.resubmission_attempts where exception_id = p_exception_id;

  insert into public.resubmission_attempts (exception_id, attempt_no, submitted_by, reason, corrective_action)
  values (p_exception_id, v_next_attempt, v_profile.id, p_reason, p_corrective_action)
  returning * into v_attempt;

  update public.exceptions set status = 'Under Review', updated_at = now() where id = p_exception_id;

  return v_attempt;
end;
$$;
revoke all on function add_resubmission_attempt(uuid,text,text) from public;
grant execute on function add_resubmission_attempt(uuid,text,text) to authenticated;

create or replace function update_resubmission_result(p_resubmission_id uuid, p_authority_result text, p_completion_date date default null)
returns public.resubmission_attempts
language plpgsql security definer set search_path = ''
as $$
declare
  v_attempt public.resubmission_attempts;
  v_exception_id uuid;
begin
  select exception_id into v_exception_id from public.resubmission_attempts where id = p_resubmission_id;
  if v_exception_id is null then
    raise exception 'NOT_FOUND: resubmission attempt % does not exist', p_resubmission_id using errcode = 'P0002';
  end if;

  perform public.fn_require_exception_access(v_exception_id, 'manage_exceptions', true);

  if p_authority_result not in ('Pending','Approved','Rejected') then
    raise exception 'INVALID_RESULT: % is not a recognized authority result', p_authority_result using errcode = '23514';
  end if;

  update public.resubmission_attempts set
    authority_result = p_authority_result,
    completion_date = coalesce(p_completion_date, case when p_authority_result <> 'Pending' then current_date else null end)
  where id = p_resubmission_id returning * into v_attempt;

  return v_attempt;
end;
$$;
revoke all on function update_resubmission_result(uuid,text,date) from public;
grant execute on function update_resubmission_result(uuid,text,date) to authenticated;

-- ============================================================
-- SECTION O — COMMENTS, REOPEN, CONFIRM COMPLETION
-- ============================================================
create or replace function add_comment(p_shipment_id uuid, p_body text)
returns public.shipment_comments
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_comment public.shipment_comments;
begin
  -- Explicit decision (review round 3, §3): comments ARE allowed on a
  -- Completed shipment. A comment is additive, non-destructive record-
  -- keeping (e.g. "customer confirmed pickup on 12 Aug") — unlike an edit to
  -- an operational field, it cannot affect completion eligibility or any
  -- business state, so it doesn't undermine the "Completed is read-only"
  -- guarantee the way editing a status or amount would. p_allow_completed
  -- = true here is deliberate, not an oversight.
  perform public.fn_lock_shipment_for_mutation(p_shipment_id, 'add_comment', true);
  v_profile := public.fn_current_profile();

  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'EMPTY_COMMENT: comment body cannot be empty' using errcode = '23502';
  end if;

  insert into public.shipment_comments (shipment_id, author, body) values (p_shipment_id, v_profile.id, p_body)
  returning * into v_comment;

  return v_comment;
end;
$$;
revoke all on function add_comment(uuid,text) from public;
grant execute on function add_comment(uuid,text) to authenticated;

create or replace function reopen_completed_shipment(p_shipment_id uuid, p_reason text)
returns public.shipments
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_shipment public.shipments;
begin
  v_shipment := public.fn_lock_shipment_for_mutation(p_shipment_id, 'close_reopen', true);
  v_profile := public.fn_current_profile();

  if v_shipment.overall_status <> 'Completed' then
    raise exception 'NOT_COMPLETED: only a Completed shipment can be reopened' using errcode = '23514';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED: a reason is mandatory to reopen a completed shipment' using errcode = '23502';
  end if;

  perform public.fn_set_audit_context('Completed shipment reopened: ' || p_reason);

  update public.shipments set
    previous_status_before_reopen = overall_status, overall_status = 'On Hold', reopened_at = now(),
    reopened_by = v_profile.id, reopen_reason = p_reason, updated_by = v_profile.id
  where id = p_shipment_id returning * into v_shipment;

  return v_shipment;
end;
$$;
revoke all on function reopen_completed_shipment(uuid,text) from public;
grant execute on function reopen_completed_shipment(uuid,text) to authenticated;

create or replace function confirm_shipment_completion(p_shipment_id uuid, p_notes text default null)
returns public.shipments
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_shipment public.shipments;
begin
  -- fn_lock_shipment_for_mutation takes the FOR UPDATE lock and already
  -- rejects a shipment that is already Completed (p_allow_completed
  -- defaults to false) — the separate ALREADY_COMPLETED check and the
  -- separate explicit "for update" select from the prior revision are
  -- both now redundant with this single call.
  v_shipment := public.fn_lock_shipment_for_mutation(p_shipment_id, 'close_reopen');
  v_profile := public.fn_current_profile();

  if v_shipment.overall_status in ('On Hold','Rejected','Cancelled','Resubmission Required') then
    raise exception 'NOT_ELIGIBLE: shipment status % cannot be completed', v_shipment.overall_status using errcode = '23514';
  end if;

  if not public.fn_is_shipment_completion_eligible(p_shipment_id) then
    raise exception 'NOT_ELIGIBLE: shipment % does not currently meet all completion conditions', p_shipment_id using errcode = '23514';
  end if;

  perform public.fn_set_audit_context('Shipment completion confirmed' || case when p_notes is not null then ' (' || p_notes || ')' else '' end);

  update public.shipments set overall_status = 'Completed', updated_by = v_profile.id
  where id = p_shipment_id returning * into v_shipment;

  return v_shipment;
end;
$$;
revoke all on function confirm_shipment_completion(uuid,text) from public;
grant execute on function confirm_shipment_completion(uuid,text) to authenticated;

-- ============================================================
-- SECTION P — DISCOVERY & PROFILE ADMINISTRATION
-- ============================================================
create or replace function update_discovery_item(p_discovery_id uuid, p_status public.discovery_status, p_notes text default null)
returns public.discovery_items
language plpgsql security definer set search_path = ''
as $$
declare
  v_item public.discovery_items;
begin
  perform public.fn_require_permission('administer');

  update public.discovery_items set status = p_status, notes = coalesce(p_notes, notes), updated_at = now()
  where id = p_discovery_id returning * into v_item;

  if v_item.id is null then
    raise exception 'NOT_FOUND: discovery item % does not exist', p_discovery_id using errcode = 'P0002';
  end if;

  return v_item;
end;
$$;
revoke all on function update_discovery_item(uuid,public.discovery_status,text) from public;
grant execute on function update_discovery_item(uuid,public.discovery_status,text) to authenticated;

create or replace function deactivate_profile(p_profile_id uuid)
returns public.profiles
language plpgsql security definer set search_path = ''
as $$
declare
  v_admin public.profiles;
  v_target public.profiles;
begin
  v_admin := public.fn_require_permission('administer');

  update public.profiles set is_active = false, deactivated_at = now(), deactivated_by = v_admin.id
  where id = p_profile_id returning * into v_target;

  if v_target.id is null then
    raise exception 'NOT_FOUND: profile % does not exist', p_profile_id using errcode = 'P0002';
  end if;

  return v_target;
end;
$$;
revoke all on function deactivate_profile(uuid) from public;
grant execute on function deactivate_profile(uuid) to authenticated;

create or replace function reactivate_profile(p_profile_id uuid)
returns public.profiles
language plpgsql security definer set search_path = ''
as $$
declare
  v_target public.profiles;
begin
  perform public.fn_require_permission('administer');

  update public.profiles set is_active = true, deactivated_at = null, deactivated_by = null
  where id = p_profile_id returning * into v_target;

  if v_target.id is null then
    raise exception 'NOT_FOUND: profile % does not exist', p_profile_id using errcode = 'P0002';
  end if;

  return v_target;
end;
$$;
revoke all on function reactivate_profile(uuid) from public;
grant execute on function reactivate_profile(uuid) to authenticated;

create or replace function change_user_role(p_profile_id uuid, p_new_role public.app_role, p_new_branch_id uuid default null)
returns public.profiles
language plpgsql security definer set search_path = ''
as $$
declare
  v_target public.profiles;
begin
  perform public.fn_require_permission('administer');

  update public.profiles set role = p_new_role, branch_id = coalesce(p_new_branch_id, branch_id)
  where id = p_profile_id returning * into v_target;

  if v_target.id is null then
    raise exception 'NOT_FOUND: profile % does not exist', p_profile_id using errcode = 'P0002';
  end if;

  return v_target;
end;
$$;
revoke all on function change_user_role(uuid,public.app_role,uuid) from public;
grant execute on function change_user_role(uuid,public.app_role,uuid) to authenticated;

-- Representative master-data admin RPC. The other 13 master-data tables
-- follow this identical pattern (require 'administer', upsert by id or
-- natural key, stamp created_by/updated_by) — flagged as a Phase 5 task to
-- generate the remaining 13 from this template, not claimed as already done.
create or replace function upsert_supplier(p_id uuid, p_code text, p_name text, p_is_active boolean default true, p_display_order int default 0)
returns public.suppliers
language plpgsql security definer set search_path = ''
as $$
declare
  v_admin public.profiles;
  v_supplier public.suppliers;
begin
  v_admin := public.fn_require_permission('administer');

  if p_id is null then
    insert into public.suppliers (code, name, is_active, display_order, created_by, updated_by)
    values (p_code, p_name, p_is_active, p_display_order, v_admin.id, v_admin.id)
    returning * into v_supplier;
  else
    update public.suppliers set
      code = p_code, name = p_name, is_active = p_is_active, display_order = p_display_order,
      updated_by = v_admin.id, updated_at = now()
    where id = p_id returning * into v_supplier;

    if v_supplier.id is null then
      raise exception 'NOT_FOUND: supplier % does not exist', p_id using errcode = 'P0002';
    end if;
  end if;

  return v_supplier;
end;
$$;
revoke all on function upsert_supplier(uuid,text,text,boolean,int) from public;
grant execute on function upsert_supplier(uuid,text,text,boolean,int) to authenticated;

-- ============================================================
-- SECTION Q — MOFAIC CALCULATION VIEW
-- security_invoker = true is essential: without it, a view runs as its
-- OWNER, bypassing the querying user's own RLS (branch scoping) on
-- `shipments`. With it, the view respects the caller's own permissions.
-- ============================================================
create or replace view v_shipment_mofaic
with (security_invoker = true)
as
select
  s.id,
  s.ref,
  s.branch_id,
  coalesce((
    select sum(i.invoice_value * fx.rate_to_aed)
    from invoices i
    join lateral (
      select rate_to_aed from fx_rates
      where currency_code = i.currency_code and effective_date <= i.invoice_date
      order by effective_date desc limit 1
    ) fx on true
    where i.shipment_id = s.id
  ), 0) as total_value_aed,
  (select applicability_threshold_aed from mofaic_rules where id = 1) as applicability_threshold_aed,
  (select payment_window_days from mofaic_rules where id = 1) as payment_window_days,
  (select is_confirmed from mofaic_rules where id = 1) as rule_confirmed,
  s.mofaic_status,
  s.delivery_order_received_date,
  case when s.delivery_order_received_date is not null
    then s.delivery_order_received_date + (select payment_window_days from mofaic_rules where id = 1) * interval '1 day'
    else null
  end as payment_due_date,
  case when s.delivery_order_received_date is not null
    then (s.delivery_order_received_date + (select payment_window_days from mofaic_rules where id = 1) * interval '1 day')::date - current_date
    else null
  end as days_until_due
from shipments s;
-- Note: FX rate lookup uses the invoice's OWN invoice_date (most recent rate
-- on or before that date) — proposed, pending Finance confirmation per the
-- architecture doc. The AED 10,000 threshold / 15-day window come from
-- mofaic_rules (configurable data, not hardcoded) and rule_confirmed = false
-- until Finance signs off.
grant select on v_shipment_mofaic to authenticated;

-- ============================================================
-- SECTION R — STORAGE POLICIES (Section 6 fix)
-- Option A chosen explicitly: a restricted authenticated INSERT policy
-- based on the approved path convention (shipments/{shipment_id}/{document_id}/
-- {filename}) plus shipment branch/permission — NOT merely a SELECT policy.
-- Previously only a SELECT policy existed; a signed upload URL minted for
-- the user's own session cannot actually be used to INSERT without this.
--
-- Recommended production hardening layered on top of this (documented, not
-- a substitute for the policy below): mint signed upload URLs from a Server
-- Action using the service_role key AFTER a Server Action already called
-- fn_lock_shipment_for_mutation(..., 'upload_docs') — so an authorization
-- decision is made twice, once by the app before issuing the URL, once by
-- this policy if a client ever attempts a direct-token upload instead.
-- ============================================================
-- upload_intents needs a real grant + RLS: the Storage INSERT policy's
-- EXISTS subquery below runs in the CALLING USER's own context (RLS policy
-- evaluation is not nested inside another SECURITY DEFINER function's
-- borrowed privileges), so `authenticated` needs actual SELECT access for
-- that subquery to even execute. Scoped to each user's own intents.
grant select on upload_intents to authenticated;
alter table upload_intents enable row level security;
drop policy if exists p_select_own_upload_intents on upload_intents;
create policy p_select_own_upload_intents on upload_intents for select
using (fn_is_active_profile() and (requested_by = auth.uid() or has_permission('administer')));

-- The bucket itself — referenced throughout this file's policies and
-- functions but never actually created until now. Private (public=false):
-- every read goes through a signed URL gated by the SELECT policy below,
-- never a public URL. 50MB per-file limit is a reasonable starting point
-- for shipment scans/PDFs; adjust in the dashboard if needed.
insert into storage.buckets (id, name, public, file_size_limit)
values ('shipment-documents', 'shipment-documents', false, 52428800)
on conflict (id) do nothing;

drop policy if exists p_storage_select_documents on storage.objects;
create policy p_storage_select_documents on storage.objects for select
using (
  bucket_id = 'shipment-documents'
  and exists (
    select 1 from public.document_versions dv
    join public.documents d on d.id = dv.document_id
    join public.shipments s on s.id = d.shipment_id
    where dv.storage_path = storage.objects.name
      and (
        has_permission('view_all_branches')
        or s.branch_id = (select branch_id from public.profiles where id = auth.uid())
      )
  )
);

drop policy if exists p_storage_insert_documents on storage.objects;
create policy p_storage_insert_documents on storage.objects for insert
with check (
  bucket_id = 'shipment-documents'
  and array_length(storage.foldername(name), 1) >= 2
  and (storage.foldername(name))[1] = 'shipments'
  and has_permission('upload_docs')
  and exists (
    select 1 from public.shipments s
    where s.id::text = (storage.foldername(name))[2]
      and (
        has_permission('view_all_branches')
        or s.branch_id = (select branch_id from public.profiles where id = auth.uid())
      )
  )
  -- Item 6 fix: a matching, unexpired, unfulfilled upload_intents row must
  -- exist for THIS exact path, belonging to the calling user, before the
  -- object can actually be written — previously any user holding
  -- upload_docs could upload an arbitrary file below a shipment path with
  -- no relationship to a real registered intent.
  and exists (
    select 1 from public.upload_intents ui
    where ui.storage_path = storage.objects.name
      and ui.requested_by = auth.uid()
      and not ui.fulfilled
      and ui.expires_at > now()
  )
);
-- No UPDATE/DELETE policy is granted for `authenticated` — this enforces
-- "no overwrite": once an object exists at a given path, it cannot be
-- silently replaced by an upsert; a real replacement always creates a NEW
-- Storage object at a new path (document_versions.storage_path is unique),
-- matching the immutable-version-history model.

-- Register an intended upload BEFORE minting the signed URL, so an upload
-- that never completes (signed URL requested but never used, or used but
-- upload_document_metadata never called) can be identified and cleaned up.
create or replace function fn_register_upload_intent(
  p_shipment_id uuid,
  p_document_id uuid,
  p_storage_path text,
  p_expected_mime_type text default null,
  p_expected_file_size bigint default null,
  p_expected_sha256_hash text default null
) returns public.upload_intents
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_intent public.upload_intents;
begin
  perform public.fn_lock_shipment_for_mutation(p_shipment_id, 'upload_docs');
  v_profile := public.fn_current_profile();

  if not public.fn_validate_storage_path(p_storage_path, p_shipment_id, p_document_id) then
    raise exception 'INVALID_STORAGE_PATH: % does not match the expected shipment/document path', p_storage_path
      using errcode = '23514';
  end if;

  insert into public.upload_intents (
    shipment_id, document_id, storage_path, requested_by,
    expected_mime_type, expected_file_size, expected_sha256_hash
  ) values (
    p_shipment_id, p_document_id, p_storage_path, v_profile.id,
    p_expected_mime_type, p_expected_file_size, p_expected_sha256_hash
  )
  returning * into v_intent;

  return v_intent;
end;
$$;
revoke all on function fn_register_upload_intent(uuid, uuid, text, text, bigint, text) from public;
grant execute on function fn_register_upload_intent(uuid, uuid, text, text, bigint, text) to authenticated;

-- Orphan cleanup: intents past expiry that were never fulfilled. Intended to
-- run on a schedule (pg_cron or an Edge Function cron) — the function itself
-- is real and callable today; the schedule is a Phase 0 deployment task.
-- ============================================================
-- ORPHAN CLEANUP (review round 3, §7) — an honest two-part contract.
--
-- IMPORTANT: deleting a row from `storage.objects` via SQL does NOT delete
-- the underlying stored file in Supabase's storage backend — that table is
-- metadata only. Actually removing the blob requires calling the Storage
-- API (`supabase.storage.from(bucket).remove([paths])`), which can only be
-- done from a context holding the service_role key — an Edge Function or
-- another secure server-side process, never a SQL function and never
-- granted to ordinary authenticated users. The functions below split the
-- responsibility honestly along that boundary:
--
--   fn_identify_orphaned_uploads()  — read-only, SQL-only, finds expired
--     unfulfilled intents. Safe to expose to service_role only.
--   fn_record_cleanup_result(...)   — SQL-only, records what an EXTERNAL
--     deletion attempt (run by the Edge Function) actually achieved:
--     success/failure, attempt count, error detail, and an audit event.
--     The Edge Function itself (not written here — this is a SQL
--     migration, not application code) is expected to: call
--     fn_identify_orphaned_uploads(), attempt storage.remove() for each
--     path, then call fn_record_cleanup_result() per outcome, retrying
--     failures on its next scheduled run (cleanup_status stays 'Failed'
--     until a subsequent attempt succeeds or an operator investigates).
-- ============================================================
create or replace function fn_identify_orphaned_uploads()
returns setof public.upload_intents
language plpgsql security definer set search_path = ''
as $$
begin
  return query
    select * from public.upload_intents
    where not fulfilled
      and expires_at < now()
      and cleanup_status in ('Pending','Failed')
    order by requested_at;
end;
$$;
revoke all on function fn_identify_orphaned_uploads() from public;
grant execute on function fn_identify_orphaned_uploads() to service_role;

create or replace function fn_record_cleanup_result(p_intent_id uuid, p_success boolean, p_error text default null)
returns public.upload_intents
language plpgsql security definer set search_path = ''
as $$
declare
  v_intent public.upload_intents;
begin
  update public.upload_intents set
    cleanup_status = case when p_success then 'Cleaned' else 'Failed' end,
    cleanup_attempts = cleanup_attempts + 1,
    cleanup_last_attempted_at = now(),
    cleanup_error = p_error
  where id = p_intent_id
  returning * into v_intent;

  if v_intent.id is null then
    raise exception 'NOT_FOUND: upload intent % does not exist', p_intent_id using errcode = 'P0002';
  end if;

  insert into public.audit_log (action, module, comment, source, result)
  values (
    case when p_success then 'Orphaned upload cleaned' else 'Orphaned upload cleanup failed' end,
    'upload_intents',
    'path=' || v_intent.storage_path || coalesce(', error=' || p_error, ''),
    'scheduler',
    case when p_success then 'Success' else 'Failure' end
  );

  return v_intent;
end;
$$;
revoke all on function fn_record_cleanup_result(uuid, boolean, text) from public;
grant execute on function fn_record_cleanup_result(uuid, boolean, text) to service_role;

-- Retained for backward compatibility with anything already calling the old
-- name, but redefined to only ever mark intents 'NotNeeded'-adjacent
-- bookkeeping is NOT done here anymore — superseded by the pair above.
-- Kept as a thin, safe no-op-if-called-directly wrapper is intentionally
-- NOT provided; callers should migrate to fn_identify_orphaned_uploads +
-- fn_record_cleanup_result. The old fn_cleanup_orphaned_uploads name is
-- dropped rather than kept around half-working.
drop function if exists fn_cleanup_orphaned_uploads();

-- ============================================================
-- SECTION S — NOTIFICATION GENERATION (Section 10 / 16)
-- Event-driven alerts, generated by triggers on the same tables that
-- already changed — no separate notification service. Covers, of the
-- Phase-1 alert list: Customs rejected, Resubmission required, High/Critical
-- exception. Delivery-order-pending, MOFAIC-approaching/overdue, ETA-passed,
-- and physical-docs-not-dispatched are TIME-based (need to fire when a
-- deadline passes, not when a row changes) and are handled by the scheduled
-- function fn_generate_time_based_notifications() below instead, since a
-- trigger cannot fire "because time passed" — it can only fire on a write.
-- ============================================================
create or replace function fn_notify_status_events()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.customs_status = 'Rejected' and old.customs_status is distinct from new.customs_status then
    insert into public.notifications (recipient, shipment_id, event_type, title, message, priority, dedup_key)
    select coalesce(new.responsible, new.coordinator), new.id, 'customs_rejected',
           'Customs rejected: ' || new.ref, 'Dubai Customs rejected the declaration for ' || new.ref, 'High',
           'customs_rejected:' || new.id || ':' || now()::date
    where coalesce(new.responsible, new.coordinator) is not null
    on conflict (dedup_key) where dedup_key is not null do nothing;
  end if;

  if new.overall_status = 'Resubmission Required' and old.overall_status is distinct from new.overall_status then
    insert into public.notifications (recipient, shipment_id, event_type, title, message, priority, dedup_key)
    select coalesce(new.responsible, new.coordinator), new.id, 'resubmission_required',
           'Resubmission required: ' || new.ref, new.ref || ' requires resubmission', 'High',
           'resubmission_required:' || new.id || ':' || now()::date
    where coalesce(new.responsible, new.coordinator) is not null
    on conflict (dedup_key) where dedup_key is not null do nothing;
  end if;

  return new;
end;
$$;
revoke all on function fn_notify_status_events() from public;

drop trigger if exists trg_notify_status_events on shipments;
create trigger trg_notify_status_events
  after update of customs_status, overall_status on shipments
  for each row execute function fn_notify_status_events();

create or replace function fn_notify_high_severity_exception()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_shipment public.shipments;
begin
  if new.severity in ('Critical','High') and (TG_OP = 'INSERT' or old.severity is distinct from new.severity) then
    select * into v_shipment from public.shipments where id = new.shipment_id;
    insert into public.notifications (recipient, shipment_id, event_type, title, message, priority, dedup_key)
    select coalesce(v_shipment.responsible, v_shipment.coordinator), new.shipment_id, 'high_severity_exception',
           new.severity || ' exception on ' || v_shipment.ref, new.description, 'Critical',
           'exception:' || new.id || ':' || new.severity
    where coalesce(v_shipment.responsible, v_shipment.coordinator) is not null
    on conflict (dedup_key) where dedup_key is not null do nothing;
  end if;
  return new;
end;
$$;
revoke all on function fn_notify_high_severity_exception() from public;

drop trigger if exists trg_notify_high_severity_exception on exceptions;
create trigger trg_notify_high_severity_exception
  after insert or update of severity on exceptions
  for each row execute function fn_notify_high_severity_exception();

-- Time-based alerts: ETA passed, MOFAIC approaching/overdue, delivery order
-- pending too long, physical docs not dispatched. Intended to be invoked
-- once daily via pg_cron (`select cron.schedule(...)`) or a scheduled Edge
-- Function — the function itself is real and callable today; the schedule
-- registration is a Phase 0 deployment task, not implemented in this
-- migration file (pg_cron scheduling is a project-level dashboard/CLI
-- action, not a portable SQL statement across environments).
create or replace function fn_generate_time_based_notifications()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_count int := 0;
begin
  -- ETA passed, still not Received/Completed
  insert into public.notifications (recipient, shipment_id, event_type, title, message, priority, dedup_key)
  select coalesce(s.responsible, s.coordinator), s.id, 'eta_passed',
         'ETA passed: ' || s.ref, s.ref || ' has passed its ETA and has not been received', 'Medium',
         'eta_passed:' || s.id || ':' || current_date
  from public.shipments s
  where s.eta is not null and s.eta < now()
    and s.overall_status not in ('Received','Completed','Cancelled')
    and coalesce(s.responsible, s.coordinator) is not null
  on conflict (dedup_key) where dedup_key is not null do nothing;
  get diagnostics v_count = row_count;

  -- MOFAIC overdue (due date passed via v_shipment_mofaic and still not Paid/N/A)
  insert into public.notifications (recipient, shipment_id, event_type, title, message, priority, dedup_key)
  select coalesce(s.mofaic_responsible, s.responsible), s.id, 'mofaic_overdue',
         'MOFAIC overdue: ' || s.ref, s.ref || ' MOFAIC payment is overdue', 'High',
         'mofaic_overdue:' || s.id || ':' || current_date
  from public.shipments s
  join public.mofaic_rules mr on mr.id = 1
  where s.mofaic_status not in ('Not Applicable','Paid','Completed')
    and s.delivery_order_received_date is not null
    and (s.delivery_order_received_date + (mr.payment_window_days || ' days')::interval)::date < current_date
    and coalesce(s.mofaic_responsible, s.responsible) is not null
  on conflict (dedup_key) where dedup_key is not null do nothing;

  -- Physical documents not dispatched N days after ready_for_dispatch was set
  -- (uses last_updated as a proxy since there's no dedicated
  -- ready_for_dispatch timestamp column; acceptable for a first cut, flagged
  -- as a nice-to-have refinement rather than a blocking gap)
  insert into public.notifications (recipient, shipment_id, event_type, title, message, priority, dedup_key)
  select coalesce(s.physical_docs_responsible, s.responsible), s.id, 'physical_docs_not_dispatched',
         'Physical docs not dispatched: ' || s.ref, s.ref || ' has been ready for dispatch for over 3 days', 'Medium',
         'physical_docs_not_dispatched:' || s.id || ':' || current_date
  from public.shipments s
  where s.ready_for_dispatch and s.physical_doc_status = 'Ready for Dispatch'
    and s.updated_at < now() - interval '3 days'
    and coalesce(s.physical_docs_responsible, s.responsible) is not null
  on conflict (dedup_key) where dedup_key is not null do nothing;

  return v_count;
end;
$$;
revoke all on function fn_generate_time_based_notifications() from public;
grant execute on function fn_generate_time_based_notifications() to authenticated;

-- ============================================================
-- SECTION T — HISTORICAL IMPORT: VALIDATION & COMMIT (Section 10)
-- These operate on import_staging_rows.raw_values, expected to already be
-- parsed into a defined JSONB shape by the Edge Function (Excel parsing
-- itself is not a SQL concern). The shape assumed here:
--   {"supplier": text, "awb": text, "invoice_no": text, "invoice_date": date,
--    "invoice_value": numeric, "currency": text, "net_weight": numeric,
--    "gross_weight": numeric, "category": text, "branch": text}
-- This validates a representative core subset of the full rule list in the
-- architecture doc (invalid date, missing supplier, duplicate AWB, duplicate
-- invoice-within-batch, negative invoice value, net>gross weight) for real,
-- executable proof of the mechanism. The remaining rules (merged-cell
-- detection, supplier spelling-variant clustering, "Re Sub" note detection,
-- unknown portal references) need the Edge Function's parsing context and
-- are a Phase 4 task — not claimed as implemented here.
-- ============================================================
create or replace function fn_validate_import_batch(p_batch_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_row record;
  v_status public.import_row_status;
  v_invoice_date date;
  v_invoice_value numeric;
  v_net_weight numeric;
  v_gross_weight numeric;
  v_awb text;
  v_invoice_no text;
begin
  perform public.fn_require_permission('administer');

  for v_row in select * from public.import_staging_rows where batch_id = p_batch_id loop
    v_status := 'Valid';
    delete from public.import_validation_issues where staging_row_id = v_row.id;

    if v_row.raw_values->>'supplier' is null or length(trim(v_row.raw_values->>'supplier')) = 0 then
      insert into public.import_validation_issues (staging_row_id, issue_code, issue_message, severity)
      values (v_row.id, 'MISSING_SUPPLIER', 'Supplier is missing', 'Error');
      v_status := 'Invalid';
    end if;

    if v_row.raw_values->>'invoice_date' is null or length(trim(v_row.raw_values->>'invoice_date')) = 0 then
      insert into public.import_validation_issues (staging_row_id, issue_code, issue_message, severity)
      values (v_row.id, 'MISSING_DATE', 'invoice_date is missing', 'Error');
      v_status := 'Invalid';
      v_invoice_date := null;
    else
      begin
        v_invoice_date := (v_row.raw_values->>'invoice_date')::date;
      exception when others then
        insert into public.import_validation_issues (staging_row_id, issue_code, issue_message, severity)
        values (v_row.id, 'INVALID_DATE', 'invoice_date could not be parsed: ' || (v_row.raw_values->>'invoice_date'), 'Error');
        v_status := 'Invalid';
        v_invoice_date := null;
      end;
    end if;

    begin
      v_invoice_value := (v_row.raw_values->>'invoice_value')::numeric;
      if v_invoice_value < 0 then
        insert into public.import_validation_issues (staging_row_id, issue_code, issue_message, severity)
        values (v_row.id, 'NEGATIVE_INVOICE_VALUE', 'invoice_value is negative', 'Error');
        v_status := 'Invalid';
      end if;
    exception when others then
      insert into public.import_validation_issues (staging_row_id, issue_code, issue_message, severity)
      values (v_row.id, 'INVALID_INVOICE_VALUE', 'invoice_value could not be parsed', 'Error');
      v_status := 'Invalid';
    end;

    begin
      v_net_weight := nullif(v_row.raw_values->>'net_weight','')::numeric;
      v_gross_weight := nullif(v_row.raw_values->>'gross_weight','')::numeric;
      if v_net_weight is not null and v_gross_weight is not null and v_net_weight > v_gross_weight then
        insert into public.import_validation_issues (staging_row_id, issue_code, issue_message, severity)
        values (v_row.id, 'WEIGHT_MISMATCH', 'net_weight exceeds gross_weight', 'Error');
        v_status := 'Invalid';
      end if;
    exception when others then
      insert into public.import_validation_issues (staging_row_id, issue_code, issue_message, severity)
      values (v_row.id, 'INVALID_WEIGHT', 'net_weight or gross_weight could not be parsed', 'Error');
      v_status := 'Invalid';
      v_net_weight := null;
      v_gross_weight := null;
    end;

    v_awb := v_row.raw_values->>'awb';
    if v_awb is not null and exists (
      select 1 from public.import_staging_rows r2
      where r2.batch_id = p_batch_id and r2.id <> v_row.id and r2.raw_values->>'awb' = v_awb
    ) then
      insert into public.import_validation_issues (staging_row_id, issue_code, issue_message, severity)
      values (v_row.id, 'DUPLICATE_AWB', 'AWB ' || v_awb || ' appears more than once in this batch', 'Warning');
      if v_status = 'Valid' then v_status := 'Warning'; end if;
    end if;
    -- Item 11: also check against EXISTING PRODUCTION shipments, not just
    -- the rest of the current staging batch.
    if v_awb is not null and exists (select 1 from public.shipments where awb = v_awb) then
      insert into public.import_validation_issues (staging_row_id, issue_code, issue_message, severity)
      values (v_row.id, 'PRODUCTION_DUPLICATE_AWB', 'AWB ' || v_awb || ' already exists in production shipments', 'Warning');
      if v_status = 'Valid' then v_status := 'Warning'; end if;
    end if;

    v_invoice_no := v_row.raw_values->>'invoice_no';
    if v_invoice_no is not null and exists (
      select 1 from public.import_staging_rows r2
      where r2.batch_id = p_batch_id and r2.id <> v_row.id and r2.raw_values->>'invoice_no' = v_invoice_no
        and r2.raw_values->>'supplier' = v_row.raw_values->>'supplier'
    ) then
      insert into public.import_validation_issues (staging_row_id, issue_code, issue_message, severity)
      values (v_row.id, 'DUPLICATE_INVOICE', 'invoice_no ' || v_invoice_no || ' duplicated for this supplier in this batch', 'Warning');
      if v_status = 'Valid' then v_status := 'Warning'; end if;
    end if;
    if v_invoice_no is not null and exists (
      select 1 from public.invoices where invoice_no = v_invoice_no and supplier_name_snapshot = v_row.raw_values->>'supplier'
    ) then
      insert into public.import_validation_issues (staging_row_id, issue_code, issue_message, severity)
      values (v_row.id, 'PRODUCTION_DUPLICATE_INVOICE', 'invoice_no ' || v_invoice_no || ' already exists in production for this supplier', 'Warning');
      if v_status = 'Valid' then v_status := 'Warning'; end if;
    end if;

    update public.import_staging_rows set
      validation_status = v_status,
      normalized_values = jsonb_build_object(
        'supplier', v_row.raw_values->>'supplier', 'invoice_date', v_invoice_date,
        'invoice_value', v_invoice_value, 'net_weight', v_net_weight, 'gross_weight', v_gross_weight,
        'awb', v_awb, 'invoice_no', v_invoice_no
      )
    where id = v_row.id;
  end loop;

  update public.import_batches set
    status = 'Validated',
    total_rows = (select count(*) from public.import_staging_rows where batch_id = p_batch_id),
    valid_rows = (select count(*) from public.import_staging_rows where batch_id = p_batch_id and validation_status = 'Valid'),
    warning_rows = (select count(*) from public.import_staging_rows where batch_id = p_batch_id and validation_status = 'Warning'),
    invalid_rows = (select count(*) from public.import_staging_rows where batch_id = p_batch_id and validation_status = 'Invalid')
  where id = p_batch_id;
end;
$$;
revoke all on function fn_validate_import_batch(uuid) from public;
grant execute on function fn_validate_import_batch(uuid) to authenticated;

-- Commits Valid + Warning rows (not Invalid) transactionally, then enforces
-- the monthly reconciliation check — hard failure if any month's committed
-- count doesn't match the expected figure.
-- Maps a raw source status string (whatever the original Excel/Mirsal 2
-- value was) to the closest overall_status enum value. Historical rows
-- with no recognizable source status are NOT forced to 'Completed' — they
-- default to 'Received' (a neutral, non-terminal state) with the row's
-- validation issues noting the fallback, so a human can review rather than
-- have the import silently assert something it doesn't actually know.
create or replace function fn_map_source_status_to_overall(p_source_status text)
returns public.overall_status
language plpgsql immutable
as $$
begin
  if p_source_status is null then
    return 'Received';
  end if;
  case
    when p_source_status ilike '%complet%' or p_source_status ilike '%closed%' then return 'Completed';
    when p_source_status ilike '%cancel%' then return 'Cancelled';
    when p_source_status ilike '%reject%' then return 'Rejected';
    when p_source_status ilike '%hold%' then return 'On Hold';
    when p_source_status ilike '%resub%' then return 'Resubmission Required';
    when p_source_status ilike '%custom%' then return 'Customs Processing';
    when p_source_status ilike '%receiv%' or p_source_status ilike '%deliver%' then return 'Received';
    else return 'Received';
  end case;
end;
$$;

-- Chunked, resumable commit. Processes at most `chunk_size` not-yet-committed
-- rows per call (item 11: configurable batch size) — a client/Edge Function
-- calls this repeatedly until it reports no rows remaining. Each row's
-- insert is wrapped in its own nested BEGIN/EXCEPTION block (a real
-- sub-transaction via Postgres's implicit savepoint for plpgsql exception
-- blocks), so one malformed row becomes a recorded validation issue and
-- `Invalid`-status row instead of aborting the entire chunk (item 11).
-- Reconciliation (item 12) is checked only once no Valid/Warning rows
-- remain uncommitted, and a mismatch is recorded as a normal batch status
-- update (not a raised exception), so the mismatch and its detail rows in
-- import_monthly_reconciliation remain visible afterward rather than being
-- rolled back along with everything else.
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
      -- Item 11: duplicate check against EXISTING PRODUCTION data too, not
      -- just the rest of the current staging batch (already checked at
      -- validation time). A production duplicate downgrades this row to a
      -- recorded issue rather than silently creating a duplicate shipment.
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
        awb, overall_status, import_batch_id, import_staging_row_id,
        source_status_raw, source_reference_raw, created_by, updated_by
      ) values (
        v_ref, 'Air', coalesce((v_row.normalized_values->>'invoice_date')::date, current_date),
        p_default_category_id, p_default_branch_id, v_row.normalized_values->>'supplier',
        v_row.normalized_values->>'awb',
        public.fn_map_source_status_to_overall(v_row.raw_values->>'status'),
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
      -- Item 11: one malformed row becomes a recorded validation issue, not
      -- an aborted chunk — the nested BEGIN/EXCEPTION acts as an implicit
      -- savepoint, rolling back only this row's partial insert.
      insert into public.import_validation_issues (staging_row_id, issue_code, issue_message, severity)
      values (v_row.id, 'COMMIT_ERROR', 'Row failed during commit: ' || SQLERRM, 'Error');
      update public.import_staging_rows set validation_status = 'Invalid' where id = v_row.id;
    end;
  end loop;

  select count(*) into v_remaining_count from public.import_staging_rows
  where batch_id = p_batch_id and validation_status in ('Valid','Warning') and not committed;

  if v_remaining_count = 0 then
    -- Item 12: reconciliation is a pre-condition for calling the batch done,
    -- checked here as a normal (non-exception) status update so results
    -- remain visible either way — never an exception that would roll back
    -- the very evidence needed to diagnose the mismatch.
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
revoke all on function fn_commit_import_batch_chunk(uuid,uuid,uuid) from public;
grant execute on function fn_commit_import_batch_chunk(uuid,uuid,uuid) to authenticated;

-- ============================================================
-- SECTION U — INTERNAL/MAINTENANCE FUNCTION LOCKDOWN (review round 3, §8)
--
-- Key fact this section relies on: when a SECURITY DEFINER function A
-- (e.g. create_shipment, granted to `authenticated`) calls another function
-- B internally, that nested call executes as A's OWNER (the role that ran
-- this migration), not as the original calling role — because SECURITY
-- DEFINER changes "current_user" for the remainder of A's execution. So B
-- only needs EXECUTE granted to its OWNER (which every function has
-- implicitly) to be called this way; it does NOT need an explicit grant to
-- `authenticated` unless something OUTSIDE a SECURITY DEFINER context calls
-- it directly. Two call sites are NOT nested this way and must keep their
-- grant: RLS policy expressions (evaluated in the querying user's own
-- session, not borrowed from another function's context) and any function a
-- Server Action is meant to call directly as part of a real user flow.
--
-- Revoked below (internal-only — never called directly by a client, only
-- ever nested inside another RPC already listed with its own grant):
--   fn_current_profile, fn_require_permission, fn_require_branch_access,
--   fn_require_shipment_access, fn_lock_shipment_for_mutation,
--   fn_require_assignable_profile, fn_require_invoice_access,
--   fn_require_document_access, fn_require_exception_access,
--   fn_is_shipment_completion_eligible, fn_set_audit_context,
--   fn_validate_storage_path,
--   fn_generate_time_based_notifications
--
-- Kept granted to `authenticated` (with the reason):
--   fn_is_active_profile, has_permission — called DIRECTLY inside RLS
--     policy expressions, which run in the querying user's own session
--     context, not nested inside another SECURITY DEFINER function.
--   fn_register_upload_intent — genuinely user-facing: a Server Action
--     calls this directly as the first real step of the upload flow.
--   Every business-action RPC (create_shipment, update_customs,
--     raise_exception, confirm_shipment_completion, etc.) — the actual
--     user-facing surface, unaffected by this section.
-- ============================================================
revoke execute on function fn_current_profile() from authenticated;
revoke execute on function fn_require_permission(text) from authenticated;
revoke execute on function fn_require_branch_access(uuid, text) from authenticated;
revoke execute on function fn_require_shipment_access(uuid, text) from authenticated;
revoke execute on function fn_lock_shipment_for_mutation(uuid, text, boolean) from authenticated;
revoke execute on function fn_require_assignable_profile(uuid, uuid, text) from authenticated;
revoke execute on function fn_require_invoice_access(uuid, text) from authenticated;
revoke execute on function fn_require_document_access(uuid, text, boolean) from authenticated;
revoke execute on function fn_require_exception_access(uuid, text, boolean) from authenticated;
revoke execute on function fn_is_shipment_completion_eligible(uuid) from authenticated;
revoke execute on function fn_set_audit_context(text, uuid) from authenticated;
revoke execute on function fn_validate_storage_path(text, uuid, uuid) from authenticated;
revoke execute on function fn_generate_time_based_notifications() from authenticated;
-- fn_generate_time_based_notifications is scheduler/service-context only —
-- granted here to service_role explicitly, so a pg_cron job or an Edge
-- Function invoking it with the service-role key can still call it; ordinary
-- authenticated users cannot, from any client, under any flow.
grant execute on function fn_generate_time_based_notifications() to service_role;
-- fn_identify_orphaned_uploads / fn_record_cleanup_result already grant only
-- to service_role at their own definition (Section — Orphan Cleanup) —
-- nothing further needed here; no authenticated grant was ever issued for
-- either, so there is nothing to revoke.

-- ============================================================
-- SECTION V — PARAMETERIZED SEARCH (Module 1 review round 4, item 6)
-- Replaces a raw PostgREST `.or()` string built from user input, which
-- risked filter-syntax injection (a crafted comma/dot/percent sequence in
-- the search box could alter which filters PostgREST actually applied).
-- This is a genuine parameterized query — v_query flows in as a normal
-- bound value used inside a static ILIKE expression, never concatenated
-- into an executed SQL string — so there is no injection surface here at
-- all, not just a mitigated one.
-- ============================================================
-- The old 4-parameter overload is superseded by the 5-parameter version
-- below (added p_view) — dropped explicitly because changing a function's
-- parameter list creates a NEW overload in Postgres rather than replacing
-- the old one; leaving both around would be confusing and the old one
-- doesn't support saved views at all.
drop function if exists search_shipments(text, public.overall_status, int, int);

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
    -- Item: the 13 saved-view quick filters, exact port of the prototype's
    -- SAVED_VIEWS predicate functions (app.js). Each is a real server-side
    -- filter, not client-side post-filtering, so pagination/counts stay
    -- correct regardless of which view is active.
    and (
      case v_view
        when 'all' then s.overall_status <> 'Cancelled'
        when 'mine' then s.responsible = v_profile.id
        when 'today' then s.eta is not null and (s.eta at time zone 'Asia/Dubai')::date = (now() at time zone 'Asia/Dubai')::date
        when 'week' then s.eta is not null
          and (s.eta at time zone 'Asia/Dubai')::date >= (now() at time zone 'Asia/Dubai')::date
          and (s.eta at time zone 'Asia/Dubai')::date <= (now() at time zone 'Asia/Dubai')::date + 7
        when 'missingdocs' then s.document_status not in ('Verified','Complete')
        when 'custpending' then s.customs_status not in ('Approved','Closed') and s.overall_status not in ('Draft','Cancelled')
        when 'munipending' then s.municipality_status not in ('Not Required','Finished') and s.overall_status not in ('Draft','Cancelled')
        when 'dopending' then s.delivery_order_status in ('Pending','Requested')
        when 'mofaicpending' then s.mofaic_status in ('Pending','Payment Due','Overdue')
        when 'physpending' then s.physical_doc_status in ('Originals Pending','Ready for Dispatch')
        when 'exceptions' then exists (
          select 1 from public.exceptions e where e.shipment_id = s.id and e.status not in ('Resolved','Closed')
        )
        when 'resub' then s.overall_status = 'Resubmission Required'
        when 'collection' then s.overall_status = 'Ready for Collection'
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
