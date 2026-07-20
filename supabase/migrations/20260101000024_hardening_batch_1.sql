-- ============================================================
-- Three independently-verified fixes, none requiring elevated
-- credentials:
--
--   1. get_new_shipment_form_context now also returns the 4 role-specific
--      assignable-profile lists (general, delivery order, MOFAIC,
--      physical documents) that New Shipment was fetching via 4 separate
--      get_assignable_profiles calls — New Shipment's initial load is
--      now genuinely one RPC.
--
--   2. create_shipment now REQUIRES a real, active supplier_id — the
--      free-text p_supplier_name fallback branch is removed entirely.
--      The canonical-name-spoofing case (p_supplier_id given, name
--      trusted from the table) was already fixed earlier; this closes
--      the remaining gap: p_supplier_id = null still let ANY caller set
--      an arbitrary, unvalidated name. The actual frontend already never
--      exercises this path (non-admins see "contact your administrator,"
--      admins go through the properly admin-gated upsert_supplier and
--      always end up with a real id selected) — this was reachable only
--      by calling the RPC directly, bypassing the UI's own restriction
--      entirely. Defense-in-depth: the real boundary belongs at the RPC,
--      not just in a component that happens not to expose the path.
--
--   3. Fixes a real, confirmed bug in get_shipment_activity_tab: `limit
--      100` was written after jsonb_agg(), which always collapses to
--      exactly one output row — so that LIMIT did nothing at all,
--      regardless of how many audit_log rows existed for the shipment.
--      Every event across a shipment's entire lifecycle was being
--      aggregated into one unbounded JSON array. Fixed by moving the
--      limit into a subquery evaluated BEFORE aggregation, so it
--      actually caps how many rows go into the array. The same
--      unbounded-aggregate shape (no limit at all, not even a broken
--      one) existed in Comments, Exceptions, and Invoices too — lower
--      real-world risk since those are typically low-volume per
--      shipment, but given a sensible cap for consistency and defense-
--      in-depth rather than leaving them genuinely unbounded.
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
    'currencies', (select coalesce(jsonb_agg(code order by code), '[]'::jsonb) from public.currencies where is_active),
    'suppliers', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.suppliers where is_active),
    -- The 4 assignable-profile lists New Shipment previously fetched via
    -- 4 separate get_assignable_profiles calls — same filtering logic
    -- (branch scope + required permission), inlined here so the whole
    -- page loads from one RPC. v_target_branch mirrors
    -- get_assignable_profiles' own rule: an explicit branch scope is
    -- only meaningful for someone who actually holds view_all_branches;
    -- everyone else only ever sees their own branch regardless.
    'general_profiles', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name) order by p.full_name), '[]'::jsonb)
      from public.profiles p
      where p.is_active and (v_view_all or p.branch_id = v_profile.branch_id)
    ),
    'delivery_order_profiles', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name) order by p.full_name), '[]'::jsonb)
      from public.profiles p
      where p.is_active and (v_view_all or p.branch_id = v_profile.branch_id)
        and exists (select 1 from public.role_permissions rp where rp.role = p.role and rp.permission = 'edit_delivery_order' and rp.allowed)
    ),
    'mofaic_profiles', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name) order by p.full_name), '[]'::jsonb)
      from public.profiles p
      where p.is_active and (v_view_all or p.branch_id = v_profile.branch_id)
        and exists (select 1 from public.role_permissions rp where rp.role = p.role and rp.permission = 'edit_mofaic' and rp.allowed)
    ),
    'physical_docs_profiles', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name) order by p.full_name), '[]'::jsonb)
      from public.profiles p
      where p.is_active and (v_view_all or p.branch_id = v_profile.branch_id)
        and exists (select 1 from public.role_permissions rp where rp.role = p.role and rp.permission = 'edit_physical_docs' and rp.allowed)
    )
  );
end;
$$;
revoke all on function get_new_shipment_form_context() from public;
grant execute on function get_new_shipment_form_context() to authenticated;

-- ---------- create_shipment: require a real supplier_id ----------
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

  -- p_supplier_name is retained as a parameter for signature stability
  -- (and because historical import still uses it for its own staging
  -- path) but is never trusted for normal shipment creation now — a
  -- real, active supplier_id is required unconditionally. The old
  -- "p_supplier_id is null -> trust p_supplier_name instead" branch is
  -- gone entirely; that was the actual remaining gap, not the name-
  -- spoofing case fixed earlier (which only covered the id-given path).
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
    origin_country_id, priority, responsible, internal_ref, notes, overall_status, created_by, updated_by
  ) values (
    v_ref, p_mode, p_shipment_date, p_category_id, p_branch_id, p_supplier_id, v_supplier_name,
    p_origin_country_id, coalesce(p_priority, 'Medium'), p_responsible, p_internal_ref, p_notes, 'Draft', v_profile.id, v_profile.id
  ) returning * into v_shipment;

  return v_shipment;
end;
$$;

-- ---------- get_shipment_activity_tab: fix the ineffective LIMIT ----------
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
  from (
    select * from public.audit_log al
    where al.shipment_ref = v_shipment.ref
    order by al.occurred_at desc
    limit 100
  ) al;

  return jsonb_build_object('events', v_events);
end;
$$;

-- ---------- get_shipment_comments_tab: add a sensible cap ----------
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
  from (
    select * from public.shipment_comments c where c.shipment_id = p_shipment_id
    order by c.created_at desc
    limit 500
  ) c;

  return jsonb_build_object(
    'comments', v_comments,
    'can_comment', public.fn_permission_for(v_profile.role, 'add_comment')
  );
end;
$$;

-- ---------- get_shipment_exceptions_tab: add a sensible cap ----------
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
  from (
    select * from public.exceptions e where e.shipment_id = p_shipment_id
    order by e.created_at desc
    limit 500
  ) e;

  select coalesce(jsonb_agg(jsonb_build_object('id', et.id, 'name', et.name)), '[]'::jsonb) into v_types
  from public.exception_types et where et.is_active;

  return jsonb_build_object(
    'exceptions', v_exceptions,
    'exception_types', v_types,
    'can_manage', public.fn_permission_for(v_profile.role, 'manage_exceptions') and v_shipment.overall_status <> 'Completed'
  );
end;
$$;

-- ---------- get_shipment_invoices_tab: add a sensible cap on the list only ----------
-- (totals/AED calc below are unaffected - those aggregate ALL invoices
-- for correctness regardless of the display list's cap)
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
  from (
    select * from public.invoices i where i.shipment_id = p_shipment_id
    order by i.created_at desc
    limit 500
  ) i;

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
