-- ============================================================
-- FFC Shipments Management System — seed.sql
--
-- LOCAL / PREVIEW ONLY. Never applied to Staging or Production.
--
-- Supabase's `supabase db reset` (local) and the GitHub-integration
-- preview-branch flow both auto-run this file after migrations. Production
-- and Staging are never seeded from this file — real users are provisioned
-- through Entra/admin workflows (see architecture doc §11), and real
-- shipment data comes from the historical import pipeline, not from here.
--
-- Contains: fake dev auth.users + profiles (one per role, @ffc-dev.local
-- emails, no real personal data) and a couple of demo shipments used by
-- the pgTAP test suite's fixtures. Production-safe reference data
-- (permissions, master data, status transitions) lives in the migration
-- 0003_reference_data.sql instead — that runs in every environment.
--
-- Idempotency note: the auth.users/profiles inserts use gen_random_uuid()
-- per run, so re-running this file against a database that already has
-- these dev users will create DUPLICATE dev accounts (different UUIDs,
-- same email — which is itself blocked by the citext unique constraint on
-- profiles.email, so a second run will actually fail loudly on that
-- constraint rather than silently duplicating). This is intentional: local
-- dev workflow is `supabase db reset` (full wipe + reseed), not repeated
-- partial appends — the SQL fixtures below need no additional real
-- idempotency guard for that workflow. If you seed into a database you
-- don't intend to reset, delete the existing dev rows first.
-- ============================================================

do $$
declare
  v_branch uuid;
  v_uid uuid;
  v_role_data record;
  v_roles text[] := array[
    'shipment_data_entry','documentation_user','customs_clearance_user','shipment_coordinator',
    'shipment_supervisor','finance_user','management_read_only','system_administrator'
  ];
  v_names text[] := array[
    'Sara Abdullah','Fatima Al Marzooqi','Rashid Al Nuaimi','Mohammed Rahman',
    'Ahmed Hassan','Lina Choueiri','Khalid Al Farsi','Noura Al Suwaidi'
  ];
  i int;
begin
  select id into v_branch from branches where code = 'DXB-AIR';

  for i in 1..array_length(v_roles,1) loop
    v_uid := gen_random_uuid();
    insert into auth.users (id, email) values (v_uid, lower(replace(v_names[i],' ','.')) || '@ffc-dev.local');
    insert into profiles (id, full_name, email, role, branch_id)
    values (v_uid, v_names[i], lower(replace(v_names[i],' ','.')) || '@ffc-dev.local', v_roles[i]::app_role, v_branch);
  end loop;
end $$;

-- A handful of realistic demo shipments (values illustrative, not real FFC data)
do $$
declare
  v_branch uuid; v_cat uuid; v_country uuid; v_port uuid; v_airline uuid; v_clearing uuid;
  v_responsible uuid; v_ref text; v_shipment_id uuid;
begin
  select id into v_branch from branches where code = 'DXB-AIR';
  select id into v_cat from shipment_categories where name = 'Fresh Fruits and Vegetables';
  select id into v_country from countries where name = 'Netherlands';
  select id into v_port from ports where code = 'DXB';
  select id into v_airline from airlines where name = 'Emirates SkyCargo';
  select id into v_clearing from clearing_agents where name = 'Fresh Fruits Company';
  select id into v_responsible from profiles where role = 'shipment_data_entry' limit 1;

  v_ref := generate_shipment_ref('AIR', extract(year from current_date)::int);
  insert into shipments (
    ref, mode, shipment_date, category_id, branch_id, supplier_name_snapshot, origin_country_id,
    priority, responsible, awb, airline_id, flight, eta, port_id, clearing_agent_id,
    packages, net_weight, gross_weight, overall_status, document_status, customs_status,
    declaration_no, customs_submission_date, created_by, updated_by
  ) values (
    v_ref, 'Air', current_date, v_cat, v_branch, 'BE Fresh Produce B.V.', v_country,
    'Medium', v_responsible, '18272200481', v_airline, 'EK0905', now() + interval '2 days', v_port, v_clearing,
    212, 4310.20, 5090, 'Customs Processing', 'Verified', 'Under Review',
    '6410299001', current_date, v_responsible, v_responsible
  ) returning id into v_shipment_id;

  insert into invoices (shipment_id, invoice_no, invoice_date, supplier_name_snapshot, invoice_value, currency_code, created_by, updated_by)
  values (v_shipment_id, 'DEV-198722', current_date, 'BE Fresh Produce B.V.', 18240.50, 'EUR', v_responsible, v_responsible);
end $$;

-- One additional dev user in the Abu Dhabi branch, specifically so the AUH
-- demo shipment below has its own branch's user as responsible — never a
-- DXB-branch user assigned across branches, even in seed/demo data.
do $$
declare
  v_auh_branch uuid;
  v_uid uuid := gen_random_uuid();
begin
  select id into v_auh_branch from branches where code = 'AUH';
  insert into auth.users (id, email) values (v_uid, 'yousef.al.zaabi@ffc-dev.local');
  insert into profiles (id, full_name, email, role, branch_id)
  values (v_uid, 'Yousef Al Zaabi', 'yousef.al.zaabi@ffc-dev.local', 'shipment_data_entry', v_auh_branch);
end $$;

-- Second demo shipment in a DIFFERENT branch (Abu Dhabi) — needed so the
-- pgTAP suite can prove a Dubai-branch user is denied access to it, and
-- vice versa (Section 1's explicitly required negative tests). Uses its
-- OWN branch's user as responsible (see above) — this seed previously,
-- incorrectly, reused the DXB-branch shipment_data_entry user here, which
-- is exactly the cross-branch-assignment bug the schema's own
-- fn_require_assignable_profile() now exists to prevent at the RPC layer.
do $$
declare
  v_branch uuid; v_cat uuid; v_country uuid; v_responsible uuid; v_ref text;
begin
  select id into v_branch from branches where code = 'AUH';
  select id into v_cat from shipment_categories where name = 'Fresh Fruits and Vegetables';
  select id into v_country from countries where name = 'Argentina';
  select id into v_responsible from profiles where role = 'shipment_data_entry' and branch_id = v_branch limit 1;

  v_ref := generate_shipment_ref('AIR', extract(year from current_date)::int);
  insert into shipments (
    ref, mode, shipment_date, category_id, branch_id, supplier_name_snapshot, origin_country_id,
    priority, responsible, overall_status, created_by, updated_by
  ) values (
    v_ref, 'Air', current_date, v_cat, v_branch, 'Andes Fruit Exports S.A.', v_country,
    'Medium', v_responsible, 'Draft', v_responsible, v_responsible
  );
end $$;
