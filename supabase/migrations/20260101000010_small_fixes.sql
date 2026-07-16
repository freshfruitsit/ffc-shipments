-- ============================================================
-- SMALL FIXES batch, per direct request:
--   1. get_new_shipment_form_context now also returns an active supplier
--      list, for the Create Shipment wizard's Supplier field to become a
--      real dropdown instead of a live search-as-you-type combobox. This
--      is a deliberate reversal of the original design's own comment
--      ("deliberately does NOT return the full supplier list — could be
--      thousands of rows") — noted, not silently dropped, since it's a
--      real trade-off: this assumes FFC's actual supplier list stays in
--      the tens-to-low-hundreds range, which matches the real 2025 Mirsal
--      data already seen. If the supplier list ever grows large enough
--      for this to matter, the search-based combobox (still fully intact
--      as search_active_suppliers/searchSuppliersAction, just no longer
--      wired into this one form) is the fallback to revisit.
--   2. Indonesian Rupiah (IDR) added to currencies + a starting FX rate —
--      the Mirsal historical data includes Indonesian suppliers, so this
--      was a real gap, not just a nice-to-have.
--   3. The Dubai branch name's em-dash replaced with a plain hyphen. This
--      is a data UPDATE, not just an edit to the old seed migration file —
--      that file's INSERT already ran with 'on conflict do nothing' on
--      any environment where it was applied, so editing its historical
--      text wouldn't actually change what's already in the table.
-- ============================================================

insert into currencies (code, name) values
  ('IDR', 'Indonesian Rupiah')
on conflict (code) do nothing;

insert into fx_rates (currency_code, effective_date, rate_to_aed, source) values
  ('IDR', current_date, 0.00024, 'manual')
on conflict (currency_code, effective_date) do nothing;

update branches set name = 'Dubai - Air Freight Unit' where code = 'DXB-AIR';

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
    'suppliers', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.suppliers where is_active)
  );
end;
$$;
revoke all on function get_new_shipment_form_context() from public;
grant execute on function get_new_shipment_form_context() to authenticated;
