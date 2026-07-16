-- ============================================================
-- MODULE 4 — Master Data, Historical Import, Audit Log, Discovery,
-- Administration.
--
-- Audit Log and Discovery need NO new SQL: audit_log already has a real
-- SELECT policy (branch-scoped for shipment events, 'administer'-gated for
-- system events) and discovery_items is already readable by every active
-- profile with update_discovery_item() already gating writes — both are
-- frontend-only work, covered by the Next.js pages in this module rather
-- than anything here.
--
-- This migration covers the two areas that DO need new SQL: the 13
-- remaining master-data upsert RPCs (following upsert_supplier's own
-- documented template exactly), and the historical-import staging RPCs
-- that let a client-side-parsed Excel file actually get into
-- import_staging_rows (fn_validate_import_batch / fn_commit_import_batch_chunk
-- already existed from Module 1.1 — this migration is what feeds them).
-- ============================================================

-- ============================================================
-- MASTER DATA — 13 upsert RPCs, one per remaining table, following
-- upsert_supplier's exact template: require 'administer', insert when
-- p_id is null, update by id otherwise, stamp created_by/updated_by where
-- the table has those columns.
-- ============================================================

create or replace function upsert_branch(p_id uuid, p_code text, p_name text, p_is_active boolean default true, p_display_order int default 0)
returns public.branches
language plpgsql security definer set search_path = ''
as $$
declare
  v_admin public.profiles;
  v_row public.branches;
begin
  v_admin := public.fn_require_permission('administer');
  if p_id is null then
    insert into public.branches (code, name, is_active, display_order, created_by, updated_by)
    values (p_code, p_name, p_is_active, p_display_order, v_admin.id, v_admin.id)
    returning * into v_row;
  else
    update public.branches set code = p_code, name = p_name, is_active = p_is_active, display_order = p_display_order,
      updated_by = v_admin.id, updated_at = now()
    where id = p_id returning * into v_row;
    if v_row.id is null then
      raise exception 'NOT_FOUND: branch % does not exist', p_id using errcode = 'P0002';
    end if;
  end if;
  return v_row;
end;
$$;
revoke all on function upsert_branch(uuid,text,text,boolean,int) from public;
grant execute on function upsert_branch(uuid,text,text,boolean,int) to authenticated;

create or replace function upsert_country(p_id uuid, p_iso_code text, p_name text, p_is_active boolean default true, p_display_order int default 0)
returns public.countries
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.countries;
begin
  perform public.fn_require_permission('administer');
  if p_id is null then
    insert into public.countries (iso_code, name, is_active, display_order)
    values (p_iso_code, p_name, p_is_active, p_display_order)
    returning * into v_row;
  else
    update public.countries set iso_code = p_iso_code, name = p_name, is_active = p_is_active,
      display_order = p_display_order, updated_at = now()
    where id = p_id returning * into v_row;
    if v_row.id is null then
      raise exception 'NOT_FOUND: country % does not exist', p_id using errcode = 'P0002';
    end if;
  end if;
  return v_row;
end;
$$;
revoke all on function upsert_country(uuid,text,text,boolean,int) from public;
grant execute on function upsert_country(uuid,text,text,boolean,int) to authenticated;

create or replace function upsert_port(p_id uuid, p_code text, p_name text, p_is_active boolean default true, p_display_order int default 0)
returns public.ports
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.ports;
begin
  perform public.fn_require_permission('administer');
  if p_id is null then
    insert into public.ports (code, name, is_active, display_order)
    values (p_code, p_name, p_is_active, p_display_order)
    returning * into v_row;
  else
    update public.ports set code = p_code, name = p_name, is_active = p_is_active,
      display_order = p_display_order, updated_at = now()
    where id = p_id returning * into v_row;
    if v_row.id is null then
      raise exception 'NOT_FOUND: port % does not exist', p_id using errcode = 'P0002';
    end if;
  end if;
  return v_row;
end;
$$;
revoke all on function upsert_port(uuid,text,text,boolean,int) from public;
grant execute on function upsert_port(uuid,text,text,boolean,int) to authenticated;

create or replace function upsert_airline(p_id uuid, p_code text, p_name text, p_is_active boolean default true, p_display_order int default 0)
returns public.airlines
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.airlines;
begin
  perform public.fn_require_permission('administer');
  if p_id is null then
    insert into public.airlines (code, name, is_active, display_order)
    values (p_code, p_name, p_is_active, p_display_order)
    returning * into v_row;
  else
    update public.airlines set code = p_code, name = p_name, is_active = p_is_active,
      display_order = p_display_order, updated_at = now()
    where id = p_id returning * into v_row;
    if v_row.id is null then
      raise exception 'NOT_FOUND: airline % does not exist', p_id using errcode = 'P0002';
    end if;
  end if;
  return v_row;
end;
$$;
revoke all on function upsert_airline(uuid,text,text,boolean,int) from public;
grant execute on function upsert_airline(uuid,text,text,boolean,int) to authenticated;

create or replace function upsert_freight_agent(p_id uuid, p_name text, p_is_active boolean default true, p_display_order int default 0)
returns public.freight_agents
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.freight_agents;
begin
  perform public.fn_require_permission('administer');
  if p_id is null then
    insert into public.freight_agents (name, is_active, display_order)
    values (p_name, p_is_active, p_display_order)
    returning * into v_row;
  else
    update public.freight_agents set name = p_name, is_active = p_is_active, display_order = p_display_order, updated_at = now()
    where id = p_id returning * into v_row;
    if v_row.id is null then
      raise exception 'NOT_FOUND: freight agent % does not exist', p_id using errcode = 'P0002';
    end if;
  end if;
  return v_row;
end;
$$;
revoke all on function upsert_freight_agent(uuid,text,boolean,int) from public;
grant execute on function upsert_freight_agent(uuid,text,boolean,int) to authenticated;

create or replace function upsert_clearing_agent(p_id uuid, p_name text, p_is_active boolean default true, p_display_order int default 0)
returns public.clearing_agents
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.clearing_agents;
begin
  perform public.fn_require_permission('administer');
  if p_id is null then
    insert into public.clearing_agents (name, is_active, display_order)
    values (p_name, p_is_active, p_display_order)
    returning * into v_row;
  else
    update public.clearing_agents set name = p_name, is_active = p_is_active, display_order = p_display_order, updated_at = now()
    where id = p_id returning * into v_row;
    if v_row.id is null then
      raise exception 'NOT_FOUND: clearing agent % does not exist', p_id using errcode = 'P0002';
    end if;
  end if;
  return v_row;
end;
$$;
revoke all on function upsert_clearing_agent(uuid,text,boolean,int) from public;
grant execute on function upsert_clearing_agent(uuid,text,boolean,int) to authenticated;

create or replace function upsert_carrier(p_id uuid, p_name text, p_is_active boolean default true, p_display_order int default 0)
returns public.carriers
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.carriers;
begin
  perform public.fn_require_permission('administer');
  if p_id is null then
    insert into public.carriers (name, is_active, display_order)
    values (p_name, p_is_active, p_display_order)
    returning * into v_row;
  else
    update public.carriers set name = p_name, is_active = p_is_active, display_order = p_display_order, updated_at = now()
    where id = p_id returning * into v_row;
    if v_row.id is null then
      raise exception 'NOT_FOUND: carrier % does not exist', p_id using errcode = 'P0002';
    end if;
  end if;
  return v_row;
end;
$$;
revoke all on function upsert_carrier(uuid,text,boolean,int) from public;
grant execute on function upsert_carrier(uuid,text,boolean,int) to authenticated;

create or replace function upsert_courier_company(p_id uuid, p_name text, p_is_active boolean default true, p_display_order int default 0)
returns public.courier_companies
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.courier_companies;
begin
  perform public.fn_require_permission('administer');
  if p_id is null then
    insert into public.courier_companies (name, is_active, display_order)
    values (p_name, p_is_active, p_display_order)
    returning * into v_row;
  else
    update public.courier_companies set name = p_name, is_active = p_is_active, display_order = p_display_order, updated_at = now()
    where id = p_id returning * into v_row;
    if v_row.id is null then
      raise exception 'NOT_FOUND: courier company % does not exist', p_id using errcode = 'P0002';
    end if;
  end if;
  return v_row;
end;
$$;
revoke all on function upsert_courier_company(uuid,text,boolean,int) from public;
grant execute on function upsert_courier_company(uuid,text,boolean,int) to authenticated;

create or replace function upsert_shipment_category(p_id uuid, p_name text, p_is_active boolean default true, p_display_order int default 0)
returns public.shipment_categories
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.shipment_categories;
begin
  perform public.fn_require_permission('administer');
  if p_id is null then
    insert into public.shipment_categories (name, is_active, display_order)
    values (p_name, p_is_active, p_display_order)
    returning * into v_row;
  else
    update public.shipment_categories set name = p_name, is_active = p_is_active, display_order = p_display_order, updated_at = now()
    where id = p_id returning * into v_row;
    if v_row.id is null then
      raise exception 'NOT_FOUND: shipment category % does not exist', p_id using errcode = 'P0002';
    end if;
  end if;
  return v_row;
end;
$$;
revoke all on function upsert_shipment_category(uuid,text,boolean,int) from public;
grant execute on function upsert_shipment_category(uuid,text,boolean,int) to authenticated;

create or replace function upsert_document_type(p_id uuid, p_name text, p_is_active boolean default true, p_display_order int default 0)
returns public.document_types
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.document_types;
begin
  perform public.fn_require_permission('administer');
  if p_id is null then
    insert into public.document_types (name, is_active, display_order)
    values (p_name, p_is_active, p_display_order)
    returning * into v_row;
  else
    update public.document_types set name = p_name, is_active = p_is_active, display_order = p_display_order, updated_at = now()
    where id = p_id returning * into v_row;
    if v_row.id is null then
      raise exception 'NOT_FOUND: document type % does not exist', p_id using errcode = 'P0002';
    end if;
  end if;
  return v_row;
end;
$$;
revoke all on function upsert_document_type(uuid,text,boolean,int) from public;
grant execute on function upsert_document_type(uuid,text,boolean,int) to authenticated;

create or replace function upsert_exception_type(p_id uuid, p_name text, p_is_active boolean default true, p_display_order int default 0)
returns public.exception_types
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.exception_types;
begin
  perform public.fn_require_permission('administer');
  if p_id is null then
    insert into public.exception_types (name, is_active, display_order)
    values (p_name, p_is_active, p_display_order)
    returning * into v_row;
  else
    update public.exception_types set name = p_name, is_active = p_is_active, display_order = p_display_order, updated_at = now()
    where id = p_id returning * into v_row;
    if v_row.id is null then
      raise exception 'NOT_FOUND: exception type % does not exist', p_id using errcode = 'P0002';
    end if;
  end if;
  return v_row;
end;
$$;
revoke all on function upsert_exception_type(uuid,text,boolean,int) from public;
grant execute on function upsert_exception_type(uuid,text,boolean,int) to authenticated;

-- currencies use their ISO code as the PK (no id column) — upsert by code.
create or replace function upsert_currency(p_code text, p_name text, p_is_active boolean default true)
returns public.currencies
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.currencies;
begin
  perform public.fn_require_permission('administer');
  insert into public.currencies (code, name, is_active)
  values (upper(trim(p_code)), p_name, p_is_active)
  on conflict (code) do update set name = excluded.name, is_active = excluded.is_active
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function upsert_currency(text,text,boolean) from public;
grant execute on function upsert_currency(text,text,boolean) to authenticated;

-- fx_rates: effective-dated, unique on (currency_code, effective_date) — an
-- "add/update rate for this date" operation, not an id-based upsert like
-- everything else, since the table has no separate identity the UI edits.
create or replace function upsert_fx_rate(p_currency_code text, p_effective_date date, p_rate_to_aed numeric, p_source text default 'manual')
returns public.fx_rates
language plpgsql security definer set search_path = ''
as $$
declare
  v_admin public.profiles;
  v_row public.fx_rates;
begin
  v_admin := public.fn_require_permission('administer');
  if p_rate_to_aed <= 0 then
    raise exception 'INVALID_RATE: rate_to_aed must be positive' using errcode = '23514';
  end if;
  if not exists (select 1 from public.currencies where code = p_currency_code) then
    raise exception 'CURRENCY_NOT_FOUND: % is not a recognized currency code', p_currency_code using errcode = 'P0002';
  end if;

  insert into public.fx_rates (currency_code, effective_date, rate_to_aed, source, created_by)
  values (p_currency_code, p_effective_date, p_rate_to_aed, coalesce(p_source, 'manual'), v_admin.id)
  on conflict (currency_code, effective_date) do update set
    rate_to_aed = excluded.rate_to_aed, source = excluded.source
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function upsert_fx_rate(text,date,numeric,text) from public;
grant execute on function upsert_fx_rate(text,date,numeric,text) to authenticated;
