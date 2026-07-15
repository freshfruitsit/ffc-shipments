-- ============================================================
-- FFC Shipments Management System
-- 0003_reference_data.sql
--
-- PRODUCTION-SAFE reference data — permissions, the role/permission
-- matrix, status transitions, and master data (branches, suppliers,
-- currencies, ports, airlines, etc.). This is a MIGRATION, not seed.sql,
-- specifically because Supabase only auto-runs seed.sql for LOCAL
-- development (`supabase db reset`) — it is never applied to a hosted
-- Preview/Staging/Production project by `supabase db push`. This data is
-- required for the application to function correctly in EVERY
-- environment, so it belongs in a migration that runs everywhere.
--
-- Runs in: Local, Preview, Staging, Production (via `supabase db push`
-- or the GitHub integration, same as 0001/0002).
--
-- Contains NO user accounts, NO auth.users rows, and NO shipment data —
-- those are dev-only convenience data and live in seed.sql instead,
-- which is never applied outside Local/Preview.
-- ============================================================

-- ============================================================
-- PERMISSIONS (18 codes — reconciled against every RPC's
-- fn_require_permission() call and every status_transitions row)
-- ============================================================
insert into permissions (code, description) values
  ('create_draft',          'Create a new shipment (Draft)'),
  ('edit_basic',             'Edit basic shipment information'),
  ('edit_transport',         'Edit transport / AWB / flight details'),
  ('edit_invoice',           'Add or edit invoices'),
  ('upload_docs',            'Upload shipment documents'),
  ('verify_docs',            'Verify or reject uploaded documents'),
  ('edit_customs',           'Update Dubai Customs and Dubai Municipality'),
  ('edit_delivery_order',    'Update delivery-order tracking'),
  ('edit_mofaic',            'Update MOFAIC follow-up'),
  ('edit_physical_docs',     'Update physical/original document dispatch'),
  ('assign',                 'Reassign responsible user / coordinator'),
  ('approve_status_change',  'Approve sensitive overall-status transitions'),
  ('close_reopen',           'Confirm completion or reopen a completed shipment'),
  ('manage_exceptions',      'Raise exceptions and log resubmission attempts'),
  ('add_comment',            'Add comments to a shipment'),
  ('export_reports',         'Export reports and register data'),
  ('administer',             'Manage users, master data and historical import'),
  ('view_all_branches',      'View shipments across all branches, not just own')
on conflict (code) do nothing;

-- ============================================================
-- ROLE PERMISSION MATRIX (deterministic — 8 roles x 18 permissions)
-- ============================================================
insert into role_permissions (role, permission, allowed) values
  -- shipment_data_entry: creates and maintains the operational core
  ('shipment_data_entry','create_draft',true), ('shipment_data_entry','edit_basic',true),
  ('shipment_data_entry','edit_transport',true), ('shipment_data_entry','edit_invoice',true),
  ('shipment_data_entry','upload_docs',true), ('shipment_data_entry','verify_docs',false),
  ('shipment_data_entry','edit_customs',false), ('shipment_data_entry','edit_delivery_order',false),
  ('shipment_data_entry','edit_mofaic',false), ('shipment_data_entry','edit_physical_docs',false),
  ('shipment_data_entry','assign',false), ('shipment_data_entry','approve_status_change',false),
  ('shipment_data_entry','close_reopen',false), ('shipment_data_entry','manage_exceptions',false),
  ('shipment_data_entry','add_comment',true), ('shipment_data_entry','export_reports',false),
  ('shipment_data_entry','administer',false), ('shipment_data_entry','view_all_branches',false),

  -- documentation_user: document intake and verification specialist
  ('documentation_user','create_draft',false), ('documentation_user','edit_basic',false),
  ('documentation_user','edit_transport',false), ('documentation_user','edit_invoice',false),
  ('documentation_user','upload_docs',true), ('documentation_user','verify_docs',true),
  ('documentation_user','edit_customs',false), ('documentation_user','edit_delivery_order',false),
  ('documentation_user','edit_mofaic',false), ('documentation_user','edit_physical_docs',false),
  ('documentation_user','assign',false), ('documentation_user','approve_status_change',false),
  ('documentation_user','close_reopen',false), ('documentation_user','manage_exceptions',false),
  ('documentation_user','add_comment',true), ('documentation_user','export_reports',false),
  ('documentation_user','administer',false), ('documentation_user','view_all_branches',false),

  -- customs_clearance_user: Dubai Customs, Municipality, delivery order, exceptions
  ('customs_clearance_user','create_draft',false), ('customs_clearance_user','edit_basic',false),
  ('customs_clearance_user','edit_transport',false), ('customs_clearance_user','edit_invoice',false),
  ('customs_clearance_user','upload_docs',true), ('customs_clearance_user','verify_docs',false),
  ('customs_clearance_user','edit_customs',true), ('customs_clearance_user','edit_delivery_order',true),
  ('customs_clearance_user','edit_mofaic',true), ('customs_clearance_user','edit_physical_docs',false),
  ('customs_clearance_user','assign',false), ('customs_clearance_user','approve_status_change',false),
  ('customs_clearance_user','close_reopen',false), ('customs_clearance_user','manage_exceptions',true),
  ('customs_clearance_user','add_comment',true), ('customs_clearance_user','export_reports',false),
  ('customs_clearance_user','administer',false), ('customs_clearance_user','view_all_branches',false),

  -- shipment_coordinator: broad day-to-day operational edit rights
  ('shipment_coordinator','create_draft',true), ('shipment_coordinator','edit_basic',true),
  ('shipment_coordinator','edit_transport',true), ('shipment_coordinator','edit_invoice',true),
  ('shipment_coordinator','upload_docs',true), ('shipment_coordinator','verify_docs',false),
  ('shipment_coordinator','edit_customs',false), ('shipment_coordinator','edit_delivery_order',false),
  ('shipment_coordinator','edit_mofaic',false), ('shipment_coordinator','edit_physical_docs',true),
  ('shipment_coordinator','assign',true), ('shipment_coordinator','approve_status_change',false),
  ('shipment_coordinator','close_reopen',false), ('shipment_coordinator','manage_exceptions',true),
  ('shipment_coordinator','add_comment',true), ('shipment_coordinator','export_reports',true),
  ('shipment_coordinator','administer',false), ('shipment_coordinator','view_all_branches',false),

  -- shipment_supervisor: full operational authority short of system administration
  ('shipment_supervisor','create_draft',true), ('shipment_supervisor','edit_basic',true),
  ('shipment_supervisor','edit_transport',true), ('shipment_supervisor','edit_invoice',true),
  ('shipment_supervisor','upload_docs',true), ('shipment_supervisor','verify_docs',true),
  ('shipment_supervisor','edit_customs',true), ('shipment_supervisor','edit_delivery_order',true),
  ('shipment_supervisor','edit_mofaic',true), ('shipment_supervisor','edit_physical_docs',true),
  ('shipment_supervisor','assign',true), ('shipment_supervisor','approve_status_change',true),
  ('shipment_supervisor','close_reopen',true), ('shipment_supervisor','manage_exceptions',true),
  ('shipment_supervisor','add_comment',true), ('shipment_supervisor','export_reports',true),
  ('shipment_supervisor','administer',false), ('shipment_supervisor','view_all_branches',true),

  -- finance_user: MOFAIC payment recording + invoice oversight + cross-branch
  -- finance_user: MOFAIC payment recording + supporting-document upload +
  -- cross-branch reconciliation visibility. Reconciled against the validated
  -- prototype: Finance does NOT edit invoice values directly (edit_invoice is
  -- false) but does upload_docs (e.g. attaching a payment receipt) and
  -- edit_mofaic. The Financial Follow-up module itself remains out of scope
  -- (removed per business direction — see scope table) but the role and
  -- these specific finance-adjacent permissions remain.
  ('finance_user','create_draft',false), ('finance_user','edit_basic',false),
  ('finance_user','edit_transport',false), ('finance_user','edit_invoice',false),
  ('finance_user','upload_docs',true), ('finance_user','verify_docs',false),
  ('finance_user','edit_customs',false), ('finance_user','edit_delivery_order',false),
  ('finance_user','edit_mofaic',true), ('finance_user','edit_physical_docs',false),
  ('finance_user','assign',false), ('finance_user','approve_status_change',false),
  ('finance_user','close_reopen',false), ('finance_user','manage_exceptions',false),
  ('finance_user','add_comment',true), ('finance_user','export_reports',true),
  ('finance_user','administer',false), ('finance_user','view_all_branches',true),

  -- management_read_only: visibility everywhere, cannot mutate anything
  ('management_read_only','create_draft',false), ('management_read_only','edit_basic',false),
  ('management_read_only','edit_transport',false), ('management_read_only','edit_invoice',false),
  ('management_read_only','upload_docs',false), ('management_read_only','verify_docs',false),
  ('management_read_only','edit_customs',false), ('management_read_only','edit_delivery_order',false),
  ('management_read_only','edit_mofaic',false), ('management_read_only','edit_physical_docs',false),
  ('management_read_only','assign',false), ('management_read_only','approve_status_change',false),
  ('management_read_only','close_reopen',false), ('management_read_only','manage_exceptions',false),
  ('management_read_only','add_comment',false), ('management_read_only','export_reports',true),
  ('management_read_only','administer',false), ('management_read_only','view_all_branches',true),

  -- system_administrator: full authority
  ('system_administrator','create_draft',true), ('system_administrator','edit_basic',true),
  ('system_administrator','edit_transport',true), ('system_administrator','edit_invoice',true),
  ('system_administrator','upload_docs',true), ('system_administrator','verify_docs',true),
  ('system_administrator','edit_customs',true), ('system_administrator','edit_delivery_order',true),
  ('system_administrator','edit_mofaic',true), ('system_administrator','edit_physical_docs',true),
  ('system_administrator','assign',true), ('system_administrator','approve_status_change',true),
  ('system_administrator','close_reopen',true), ('system_administrator','manage_exceptions',true),
  ('system_administrator','add_comment',true), ('system_administrator','export_reports',true),
  ('system_administrator','administer',true), ('system_administrator','view_all_branches',true)
on conflict (role, permission) do update set allowed = excluded.allowed;

-- ============================================================
-- STATUS TRANSITIONS (data-driven — see change_shipment_status)
-- ============================================================
insert into status_transitions (from_status, to_status, required_permission, requires_reason) values
  ('Draft','Documents Pending','edit_basic',false),
  ('Draft','Ready for Submission','edit_basic',false),
  ('Draft','Cancelled','edit_basic',true),
  ('Documents Pending','Ready for Submission','edit_basic',false),
  ('Documents Pending','Cancelled','edit_basic',true),
  ('Ready for Submission','Submitted','edit_customs',false),
  ('Submitted','Customs Processing','edit_customs',false),
  ('Submitted','On Hold','approve_status_change',true),
  ('Submitted','Rejected','edit_customs',true),
  ('Customs Processing','Clearance Pending','edit_customs',false),
  ('Customs Processing','On Hold','approve_status_change',true),
  ('Customs Processing','Rejected','edit_customs',true),
  ('Customs Processing','Resubmission Required','manage_exceptions',true),
  ('Clearance Pending','Ready for Collection','edit_delivery_order',false),
  ('Ready for Collection','Received','edit_physical_docs',false),
  ('On Hold','Customs Processing','approve_status_change',true),
  ('On Hold','Cancelled','approve_status_change',true),
  ('Rejected','Resubmission Required','manage_exceptions',true),
  ('Rejected','Cancelled','approve_status_change',true),
  ('Resubmission Required','Submitted','manage_exceptions',false),
  ('Resubmission Required','Cancelled','approve_status_change',true)
on conflict (from_status, to_status) do nothing;
-- Note: there is deliberately NO row targeting 'Completed' here. The only path
-- to Completed is confirm_shipment_completion(), which additionally requires
-- completion_eligible = true (see fn_check_completion_eligibility) — a bar
-- change_shipment_status alone cannot enforce. Keeping a parallel
-- 'Received' -> 'Completed' row in this table would create two routes to the
-- same end state with different guarantees; removed to keep
-- confirm_shipment_completion the single source of truth for closing a shipment.

-- ============================================================
-- CORE MASTER DATA
-- ============================================================
insert into branches (code, name, display_order) values
  ('DXB-AIR','Dubai — Air Freight Unit',1),
  ('AUH','Abu Dhabi Branch',2),
  ('SHJ','Sharjah Branch',3)
on conflict (code) do nothing;

insert into currencies (code, name) values
  ('AED','UAE Dirham'),('USD','US Dollar'),('EUR','Euro'),('AUD','Australian Dollar')
on conflict (code) do nothing;

insert into fx_rates (currency_code, effective_date, rate_to_aed, source) values
  ('AED', current_date, 1.000000, 'fixed'),
  ('USD', current_date, 3.6725, 'manual'),
  ('EUR', current_date, 4.0100, 'manual'),
  ('AUD', current_date, 2.4300, 'manual')
on conflict (currency_code, effective_date) do nothing;

insert into ports (code, name, display_order) values
  ('DXB','Dubai International Airport',1),
  ('DWC','Al Maktoum International Airport',2),
  ('DFC','Dubai Free Zone Council Cargo',3),
  ('SHJ','Sharjah International Airport',4)
on conflict (code) do nothing;

insert into airlines (name, display_order) values
  ('Emirates SkyCargo',1),('dnata',2),('Turkish Airlines Cargo',3),
  ('flydubai Cargo',4),('Qatar Airways Cargo',5)
on conflict (name) do nothing;

insert into freight_agents (name, display_order) values
  ('Kuehne+Nagel',1),('DHL Global Forwarding',2),('Agility Logistics',3),('DSV Air & Sea',4)
on conflict (name) do nothing;

insert into clearing_agents (name, display_order) values
  ('Fresh Fruits Company',1),('Al Barari Clearing LLC',2),('Gulf Star Customs Services',3),
  ('Emirates Logistics Clearance',4),('Falcon Clearing Agency',5)
on conflict (name) do nothing;

insert into carriers (name, display_order) values
  ('Emirates SkyCargo',1),('dnata',2)
on conflict (name) do nothing;

insert into courier_companies (name, display_order) values
  ('Zajeel',1),('Aramex',2),('DHL Express',3)
on conflict (name) do nothing;

insert into shipment_categories (name, display_order) values
  ('Fresh Fruits and Vegetables',1),('Others',2)
on conflict (name) do nothing;

insert into document_types (name, display_order) values
  ('Commercial Invoice',1),('Packing List',2),('Air Waybill',3),('Certificate of Origin',4),
  ('Health Certificate',5),('Municipality Draft',6),('Municipality Submission',7),
  ('Delivery Order',8),('MOFAIC Attestation',9),('Other',10)
on conflict (name) do nothing;

insert into exception_types (name, display_order) values
  ('Missing Documents',1),('Incorrect Documents',2),('Duplicate AWB',3),('Invoice Mismatch',4),
  ('Weight Mismatch',5),('Customs Rejection',6),('Municipality Rejection',7),('MOFAIC Issue',8),
  ('Delivery Order Delay',9),('Shipment Delay',10),('Damaged Shipment',11),
  ('Resubmission Required',12),('Financial Issue',13),('Courier Issue',14),
  ('Cancelled Shipment',15),('Other',16)
on conflict (name) do nothing;

insert into suppliers (code, name, display_order) values
  ('SUP-001','BE Fresh Produce B.V.',1),
  ('SUP-002','Sunshine Growers Ltd.',2),
  ('SUP-003','Del Monte Fresh Produce N.V.',3),
  ('SUP-004','Cape Fruit Exports (Pty) Ltd',4),
  ('SUP-005','Nature''s Best Produce Co.',5),
  ('SUP-006','Golden Valley Farms',6),
  ('SUP-007','Mediterranean Fresh Exports S.L.',7),
  ('SUP-008','Tropical Harvest International',8)
on conflict (code) do nothing;

insert into countries (iso_code, name, display_order) values
  ('NL','Netherlands',1),('AR','Argentina',2),('US','United States',3),('AU','Australia',4),
  ('ZA','South Africa',5),('EG','Egypt',6),('IN','India',7),('LK','Sri Lanka',8),
  ('TN','Tunisia',9),('NZ','New Zealand',10),('ZM','Zambia',11),('MA','Morocco',12)
on conflict (name) do nothing;

-- Required documents by category (applies to all origins for now — origin_country_id
-- left null; a per-origin override, e.g. an extra phytosanitary certificate for a
-- specific country, can be added later as an additional row with that country set).
-- This is a first-cut configuration, explicitly flagged as pending confirmation
-- with FFC's documentation team on the exact required list per category/origin.
insert into required_documents (category_id, document_type_id)
select c.id, dt.id
from shipment_categories c, document_types dt
where c.name = 'Fresh Fruits and Vegetables'
  and dt.name in ('Commercial Invoice', 'Packing List', 'Air Waybill', 'Certificate of Origin', 'Health Certificate')
on conflict (category_id, origin_country_id, document_type_id) do nothing;

insert into required_documents (category_id, document_type_id)
select c.id, dt.id
from shipment_categories c, document_types dt
where c.name = 'Others'
  and dt.name in ('Commercial Invoice', 'Packing List', 'Air Waybill')
on conflict (category_id, origin_country_id, document_type_id) do nothing;

