-- ============================================================
-- FFC Shipments Management System
-- 20260101000004_public_reference_data.sql
--
-- Performance fix: master/reference data (airlines, ports, agents,
-- carriers, couriers, document types, categories, currencies, countries,
-- branches) was gated behind fn_is_active_profile(), which requires a
-- live per-user session (cookies) to evaluate. That makes it impossible
-- to safely cache these lookups across requests with unstable_cache,
-- which explicitly cannot read cookies inside a cached scope — every tab
-- navigation was re-fetching this rarely-changing data from scratch,
-- adding real, avoidable latency on every click.
--
-- Decision: these specific tables contain no confidential information
-- (an airline's name, a port code, a document-type label are not
-- sensitive — unlike shipments, profiles, or anything with real business
-- data), so they're relaxed to `using (true)` and granted to `anon` too.
-- This lets the app use a plain, cookie-independent Supabase client for
-- these reads specifically, which can then be safely wrapped in
-- unstable_cache. Every other table's RLS is unchanged.
-- ============================================================

grant select on
  branches, countries, ports, airlines, freight_agents, clearing_agents,
  carriers, courier_companies, shipment_categories, document_types, currencies
to anon;

drop policy if exists p_select_all_authenticated on branches;
create policy p_select_public on branches for select using (true);

drop policy if exists p_select_all_authenticated on countries;
create policy p_select_public on countries for select using (true);

drop policy if exists p_select_all_authenticated on ports;
create policy p_select_public on ports for select using (true);

drop policy if exists p_select_all_authenticated on airlines;
create policy p_select_public on airlines for select using (true);

drop policy if exists p_select_all_authenticated on freight_agents;
create policy p_select_public on freight_agents for select using (true);

drop policy if exists p_select_all_authenticated on clearing_agents;
create policy p_select_public on clearing_agents for select using (true);

drop policy if exists p_select_all_authenticated on carriers;
create policy p_select_public on carriers for select using (true);

drop policy if exists p_select_all_authenticated on courier_companies;
create policy p_select_public on courier_companies for select using (true);

drop policy if exists p_select_all_authenticated on shipment_categories;
create policy p_select_public on shipment_categories for select using (true);

drop policy if exists p_select_all_authenticated on document_types;
create policy p_select_public on document_types for select using (true);

drop policy if exists p_select_all_authenticated on currencies;
create policy p_select_public on currencies for select using (true);

-- Deliberately UNCHANGED (still fn_is_active_profile()-gated, still
-- correctly excluded from caching): suppliers (business data — supplier
-- names/relationships are the kind of thing a competitor could find
-- useful, unlike "Emirates SkyCargo exists as an airline"), exception_types,
-- status_transitions, required_documents, mofaic_rules, fx_rates,
-- role_permissions, permissions. If a future performance pass wants any of
-- these cached too, that needs a case-by-case sensitivity judgment, not a
-- blanket rule.
