-- ============================================================
-- FFC Shipments Management System
-- 0001_initial_schema.sql
-- Extensions, enums, identity & authorization, master data,
-- operational tables, governance, historical import.
-- Designed for Supabase Postgres 17 (validated locally on Postgres 16;
-- no version-specific syntax used).
-- ============================================================

-- ---------- Extensions ----------
create extension if not exists pgcrypto;      -- gen_random_uuid()
create extension if not exists pg_trgm;       -- trigram search for supplier/AWB free-text search
create extension if not exists citext;        -- case-insensitive email/code matching

-- ============================================================
-- ENUMS
-- ============================================================
create type app_role as enum (
  'shipment_data_entry',
  'documentation_user',
  'customs_clearance_user',
  'shipment_coordinator',
  'shipment_supervisor',
  'finance_user',
  'management_read_only',
  'system_administrator'
);

create type overall_status as enum (
  'Draft','Documents Pending','Ready for Submission','Submitted',
  'Customs Processing','Clearance Pending','Ready for Collection',
  'Received','Completed','On Hold','Rejected','Resubmission Required','Cancelled'
);
create type document_status as enum (
  'Not Started','Documents Pending','Partially Complete','Complete',
  'Under Verification','Verified','Rejected'
);
create type customs_status as enum (
  'Not Started','Draft','Request Created','Submitted','Declaration Created',
  'Under Review','Approved','Rejected','Resubmission Required','Closed'
);
create type municipality_status as enum (
  'Not Required','Not Started','Draft','Submitted','Under Review',
  'Finished','Rejected','Resubmission Required'
);
create type delivery_order_status as enum (
  'Not Required','Pending','Requested','Received','Uploaded','Verified'
);
create type mofaic_status as enum (
  'Not Applicable','Applicability Review','Pending','Payment Due',
  'Paid','Overdue','Completed','Exception'
);
create type physical_doc_status as enum (
  'Not Required','Originals Pending','Ready for Dispatch','Dispatched',
  'In Transit','Delivered','Proof of Delivery Received','Closed'
);
create type doc_version_status as enum (
  'Uploaded','Verified','Rejected','Archived'
);
create type exception_status_t as enum (
  'Open','Under Review','Waiting for Supplier','Waiting for Carrier',
  'Waiting for Authority','Waiting for Finance','Resolved','Closed'
);
create type discovery_status as enum (
  'Not Discussed','Under Review','Pending Confirmation','Approved','Rejected','Deferred'
);
create type import_batch_status as enum (
  'Uploaded','Parsing','Validated','Committing','Committed','Failed'
);
create type import_row_status as enum (
  'Pending','Valid','Warning','Invalid'
);
create type notification_priority as enum ('Low','Medium','High','Critical');

-- ============================================================
-- IDENTITY & AUTHORIZATION
-- ============================================================

-- Master data referenced by profiles (branches) is declared just below profiles
-- so profiles.branch_id has something to point to; see §MASTER DATA for the
-- full branches table definition — declared first here to satisfy the FK.
create table branches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email citext not null unique,
  role app_role not null default 'shipment_data_entry',
  branch_id uuid references branches(id),
  is_active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_profiles_role on profiles(role);
create index idx_profiles_branch on profiles(branch_id);

alter table branches add constraint fk_branches_created_by foreign key (created_by) references profiles(id);
alter table branches add constraint fk_branches_updated_by foreign key (updated_by) references profiles(id);

create table permissions (
  code text primary key,
  description text not null
);

create table role_permissions (
  role app_role not null,
  permission text not null references permissions(code),
  allowed boolean not null default false,
  primary key (role, permission)
);

-- ============================================================
-- MASTER DATA
-- (branches already created above; profiles needed it early)
-- ============================================================
create table suppliers (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id)
);
create index idx_suppliers_name_trgm on suppliers using gin (name gin_trgm_ops);

create table countries (
  id uuid primary key default gen_random_uuid(),
  iso_code text unique,                 -- ISO 3166-1 alpha-2 where known
  name text not null unique,
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ports (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,            -- DXB, DWC, DFC, SHJ
  name text not null,
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table airlines (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null unique,
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table freight_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table clearing_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table carriers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,            -- Emirates SkyCargo, dnata, ...
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table courier_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,            -- Zajeel, Aramex, DHL Express
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table shipment_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,            -- 'Fresh Fruits and Vegetables', 'Others'
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table document_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,            -- Commercial Invoice, Packing List, ...
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table exception_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Currencies use their ISO code as the natural primary key — codes don't get
-- renamed the way a supplier does, so no FK+snapshot pattern is needed here.
create table currencies (
  code text primary key,                -- 'AED','USD','EUR','AUD'
  name text not null,
  is_active boolean not null default true
);

-- Exchange rates: effective-dated, so "which rate did we use" is always
-- reconstructable. See §18 of the architecture doc for which date drives the
-- lookup (invoice_date) — this is flagged as a business rule pending Finance
-- confirmation, not asserted as final.
create table fx_rates (
  id uuid primary key default gen_random_uuid(),
  currency_code text not null references currencies(code),
  effective_date date not null,
  rate_to_aed numeric(14,6) not null check (rate_to_aed > 0),
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  unique (currency_code, effective_date)
);
create index idx_fx_rates_lookup on fx_rates (currency_code, effective_date desc);

-- ============================================================
-- SHIPMENT REFERENCE GENERATION (concurrency-safe, per mode+year)
-- ============================================================
create table ref_counters (
  mode text not null,
  year int not null,
  last_number int not null default 0,
  primary key (mode, year)
);

create or replace function generate_shipment_ref(p_mode text, p_year int)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next int;
begin
  insert into public.ref_counters (mode, year, last_number)
  values (upper(p_mode), p_year, 1)
  on conflict (mode, year)
    do update set last_number = public.ref_counters.last_number + 1
  returning last_number into v_next;

  return 'FFC-' || upper(p_mode) || '-' || p_year || '-' || lpad(v_next::text, 6, '0');
end;
$$;
revoke all on function generate_shipment_ref(text,int) from public;
grant execute on function generate_shipment_ref(text,int) to authenticated;
-- Concurrency safety: the INSERT ... ON CONFLICT DO UPDATE ... RETURNING takes
-- a row-level lock on the single (mode, year) counter row. Two concurrent
-- transactions calling this for the same mode/year serialize on that lock —
-- Postgres guarantees no two callers can ever receive the same v_next.
-- Resets each year automatically because year is part of the key.
-- New modes (Sea/Land) need no redesign: just call with a different p_mode.
-- Historical imported references keep their original text values (inserted
-- directly into shipments.ref, uniqueness enforced by shipments_ref_key);
-- if an import ever shares a (mode, year) with new production shipments,
-- seed ref_counters.last_number to the historical max for that key during
-- the import commit step to guarantee no future collision.

-- ============================================================
-- STATUS TRANSITION MODEL — status changes are data-driven, not arbitrary
-- ============================================================
create table status_transitions (
  from_status overall_status not null,
  to_status overall_status not null,
  required_permission text not null references permissions(code),
  requires_reason boolean not null default false,
  primary key (from_status, to_status)
);

-- ============================================================
-- OPERATIONAL DATA
-- ============================================================
create table shipments (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,                       -- FFC-AIR-2026-000001 (see generate_shipment_ref)
  internal_ref text,
  mode text not null default 'Air',
  shipment_date date not null default current_date,

  category_id uuid references shipment_categories(id),
  branch_id uuid not null references branches(id),

  supplier_id uuid references suppliers(id),
  supplier_name_snapshot text not null,           -- immutable at creation time; supplier record may be renamed later
  origin_country_id uuid references countries(id),

  priority text not null default 'Medium',
  responsible uuid references profiles(id),
  coordinator uuid references profiles(id),

  -- transport
  awb text,
  airline_id uuid references airlines(id),
  flight text,
  eta timestamptz,
  port_id uuid references ports(id),
  freight_agent_id uuid references freight_agents(id),
  clearing_agent_id uuid references clearing_agents(id),
  packages int,
  net_weight numeric(10,2),
  gross_weight numeric(10,2),
  transport_remarks text,
  constraint chk_weights check (net_weight is null or gross_weight is null or net_weight <= gross_weight),

  -- overall + sub-process statuses — never merged into one field
  overall_status overall_status not null default 'Draft',
  document_status document_status not null default 'Not Started',
  customs_status customs_status not null default 'Not Started',
  municipality_status municipality_status not null default 'Not Required',
  delivery_order_status delivery_order_status not null default 'Not Required',
  mofaic_status mofaic_status not null default 'Not Applicable',
  physical_doc_status physical_doc_status not null default 'Not Required',
  completion_eligible boolean not null default false,   -- see fn_check_completion_eligibility

  -- Dubai Customs
  declaration_no text,
  customs_submission_date date,
  customs_result text,
  customs_remarks text,

  -- Dubai Municipality (two references — draft vs. submitted)
  municipality_draft_ref text,
  municipality_submitted_ref text,
  municipality_submission_date date,
  municipality_completion_date date,
  municipality_remarks text,

  -- Delivery Order
  carrier_id uuid references carriers(id),
  delivery_order_requested_date date,
  delivery_order_received_date date,
  delivery_order_doc_uploaded boolean not null default false,
  delivery_order_responsible uuid references profiles(id),
  delivery_order_remarks text,

  -- MOFAIC
  mofaic_ref text,
  mofaic_payment_amount numeric(12,2),
  mofaic_currency text references currencies(code),
  mofaic_payment_date date,
  mofaic_responsible uuid references profiles(id),
  mofaic_remarks text,

  -- Physical Documents
  originals_required boolean not null default true,
  originals_received boolean not null default false,
  ready_for_dispatch boolean not null default false,
  courier_company_id uuid references courier_companies(id),
  tracking_number text,
  dispatch_date date,
  delivered_date date,
  pod_received boolean not null default false,
  physical_docs_responsible uuid references profiles(id),
  physical_docs_remarks text,

  notes text,
  reopened_at timestamptz,
  reopened_by uuid references profiles(id),
  reopen_reason text,
  previous_status_before_reopen overall_status,

  -- Historical import traceability (review round 3, §11): preserved rather
  -- than discarded, so an imported shipment's original source state is
  -- always reconstructable, and it is never silently forced to Completed.
  import_batch_id uuid,
  import_staging_row_id bigint,
  source_status_raw text,
  source_reference_raw text,

  created_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);
create index idx_shipments_overall_status on shipments(overall_status);
create index idx_shipments_responsible on shipments(responsible);
create index idx_shipments_branch on shipments(branch_id);
create index idx_shipments_customs_status on shipments(customs_status);
create index idx_shipments_municipality_status on shipments(municipality_status);
create index idx_shipments_delivery_order_status on shipments(delivery_order_status);
create index idx_shipments_mofaic_status on shipments(mofaic_status);
create index idx_shipments_document_status on shipments(document_status);
create index idx_shipments_eta on shipments(eta);
create index idx_shipments_shipment_date on shipments(shipment_date);
create index idx_shipments_last_updated on shipments(updated_at);
create index idx_shipments_awb on shipments(awb);
create index idx_shipments_awb_trgm on shipments using gin (awb gin_trgm_ops);
create index idx_shipments_ref_trgm on shipments using gin (ref gin_trgm_ops);
create index idx_shipments_supplier_trgm on shipments using gin (supplier_name_snapshot gin_trgm_ops);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  invoice_no text not null,
  invoice_date date not null,
  supplier_id uuid references suppliers(id),
  supplier_name_snapshot text not null,
  invoice_value numeric(12,2) not null check (invoice_value >= 0),
  currency_code text not null references currencies(code),
  purchase_order_no text,
  supplier_reference text,
  payment_terms text,
  remarks text,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id),
  unique (shipment_id, invoice_no)
);
create index idx_invoices_shipment on invoices(shipment_id);
create index idx_invoices_invoice_no on invoices(invoice_no);
create index idx_invoices_invoice_no_trgm on invoices using gin (invoice_no gin_trgm_ops);
-- Duplicate-invoice detection ACROSS shipments is a reporting/exception concern,
-- not a hard uniqueness constraint (the same invoice_no legitimately cannot repeat
-- within one shipment, but a supplier's invoice numbering could theoretically repeat
-- across unrelated shipments over multiple years). Implemented as a scheduled check
-- (or on-demand report) that flags invoice_no+supplier_id combinations appearing on
-- more than one shipment within a rolling window, raised as an Exception rather than
-- rejected at insert time — a hard constraint here would block legitimate re-use.

-- Logical document (one row per "document slot" — e.g. "the Commercial Invoice for
-- this shipment"); document_versions below holds the actual immutable file history.
create table documents (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  invoice_id uuid references invoices(id) on delete set null,
  document_type_id uuid not null references document_types(id),
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);
create index idx_documents_shipment on documents(shipment_id);
create index idx_documents_invoice on documents(invoice_id);

create table document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  version_number int not null,
  storage_bucket text not null default 'shipment-documents',
  storage_path text not null unique,        -- never reused; every version gets a new object
  original_filename text not null,
  mime_type text,
  file_size bigint,
  sha256_hash text not null,
  is_current boolean not null default true,
  replaces_version_id uuid references document_versions(id),
  status doc_version_status not null default 'Uploaded',
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz not null default now(),
  verified_by uuid references profiles(id),
  verified_at timestamptz,
  expiry_date date,
  remarks text,
  archived_at timestamptz,
  archived_by uuid references profiles(id),
  archive_reason text,
  unique (document_id, version_number)
);
create index idx_docversions_document on document_versions(document_id);
create index idx_docversions_status on document_versions(status);
create index idx_docversions_expiry on document_versions(expiry_date);
-- Exactly one current version per logical document:
create unique index uq_docversions_current on document_versions(document_id) where is_current;

create table shipment_comments (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  author uuid references profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index idx_comments_shipment on shipment_comments(shipment_id);

create table exceptions (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  exception_type_id uuid not null references exception_types(id),
  severity text not null,                    -- Critical/High/Medium/Low
  description text not null,
  raised_by uuid references profiles(id),
  assigned_to uuid references profiles(id),
  raised_date date not null default current_date,
  due_date date,
  status exception_status_t not null default 'Open',
  root_cause text,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_exceptions_shipment on exceptions(shipment_id);
create index idx_exceptions_status on exceptions(status);
create index idx_exceptions_severity on exceptions(severity);

create table resubmission_attempts (
  id uuid primary key default gen_random_uuid(),
  exception_id uuid not null references exceptions(id) on delete cascade,
  attempt_no int not null,
  submission_date date not null default current_date,
  submitted_by uuid references profiles(id),
  reason text not null,
  corrective_action text not null,
  authority_result text not null default 'Pending',
  completion_date date,
  unique (exception_id, attempt_no)
);
create index idx_resubmissions_exception on resubmission_attempts(exception_id);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient uuid not null references profiles(id),
  shipment_id uuid references shipments(id) on delete cascade,
  event_type text not null,
  title text not null,
  message text not null,
  priority notification_priority not null default 'Medium',
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  link_target text,
  dedup_key text
);
create index idx_notifications_recipient on notifications(recipient, is_read);
create unique index uq_notifications_dedup on notifications(dedup_key) where dedup_key is not null;

create table user_saved_views (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references profiles(id),
  name text not null,
  filters jsonb not null,
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner, name)
);

-- ============================================================
-- GOVERNANCE
-- ============================================================
create table discovery_items (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,             -- DEC-01, DEC-02, ...
  topic text not null,
  description text not null,
  proposed_rule text not null,
  owner uuid references profiles(id),
  due_date date,
  status discovery_status not null default 'Not Discussed',
  notes text,
  updated_at timestamptz not null default now()
);

-- Append-only. No update/delete grants for any application role (see 0002).
-- details holds an optional technical JSONB diff — kept lean, not a full
-- row dump, to bound row size as this table grows into the millions of rows.
create table audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  correlation_id uuid,
  actor uuid references profiles(id),
  actor_role app_role,
  action text not null,
  module text not null,
  shipment_ref text,
  related text,
  old_value text,
  new_value text,
  comment text,
  details jsonb,
  source text not null default 'app',
  result text not null default 'Success'
);
create index idx_audit_occurred_at on audit_log(occurred_at desc);
create index idx_audit_shipment_ref on audit_log(shipment_ref);
create index idx_audit_actor on audit_log(actor);
create index idx_audit_module on audit_log(module);
-- Retention/archival strategy (documented, not yet needed at 5,000-shipment scale):
-- once audit_log exceeds ~5M rows or 2 years of history, convert to RANGE
-- partitioning on occurred_at (monthly partitions) and move partitions older
-- than the retention window to cheaper cold storage (e.g. a nightly export to
-- Storage as compressed JSONL) rather than deleting them outright.

-- ============================================================
-- HISTORICAL IMPORT — restartable, chunked, idempotent
-- ============================================================
create table import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_sha256 text not null unique,       -- prevents re-importing an identical file as a new batch
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz not null default now(),
  status import_batch_status not null default 'Uploaded',
  chunk_size int not null default 500,    -- configurable batch size for chunked parsing/commit
  total_rows int,
  valid_rows int,
  warning_rows int,
  invalid_rows int,
  last_processed_row int not null default 0,   -- resume point for chunked parsing
  reconciliation_passed boolean,
  committed_at timestamptz,
  committed_by uuid references profiles(id),
  failure_reason text
);

create table import_staging_rows (
  id bigint generated always as identity primary key,
  batch_id uuid not null references import_batches(id) on delete cascade,
  source_row_number int not null,
  source_month text,
  raw_values jsonb not null,
  normalized_values jsonb,
  validation_status import_row_status not null default 'Pending',
  committed boolean not null default false,
  committed_shipment_id uuid references shipments(id),
  unique (batch_id, source_row_number)          -- idempotent re-processing of a chunk
);
create index idx_staging_batch on import_staging_rows(batch_id);
create index idx_staging_status on import_staging_rows(validation_status);

-- Now that import_batches/import_staging_rows exist, wire the traceability
-- FKs added to shipments earlier.
alter table shipments add constraint fk_shipments_import_batch foreign key (import_batch_id) references import_batches(id);
alter table shipments add constraint fk_shipments_import_staging_row foreign key (import_staging_row_id) references import_staging_rows(id);
create index idx_shipments_import_batch on shipments(import_batch_id) where import_batch_id is not null;

create table import_validation_issues (
  id bigint generated always as identity primary key,
  staging_row_id bigint not null references import_staging_rows(id) on delete cascade,
  issue_code text not null,
  issue_message text not null,
  severity text not null default 'Warning'      -- Warning / Error
);
create index idx_import_issues_row on import_validation_issues(staging_row_id);

create table import_monthly_reconciliation (
  batch_id uuid not null references import_batches(id) on delete cascade,
  month_label text not null,
  expected_count int not null,
  committed_count int not null default 0,
  primary key (batch_id, month_label)
);

-- ============================================================
-- REQUIRED-DOCUMENTS CONFIGURATION (by category, optionally by origin country)
-- Drives the document_status recalculation function in 0002.
-- ============================================================
create table required_documents (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references shipment_categories(id),
  origin_country_id uuid references countries(id),   -- null = applies to all origins for this category
  document_type_id uuid not null references document_types(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (category_id, origin_country_id, document_type_id)
);

-- ============================================================
-- CONFIGURABLE MOFAIC BUSINESS RULE (threshold/deadline as data, not code —
-- explicitly a "Proposed rule — pending business confirmation" per the
-- architecture doc; storing it as a single-row config table makes changing
-- it a data update, not a code deploy)
-- ============================================================
create table mofaic_rules (
  id int primary key default 1 check (id = 1),   -- singleton row
  applicability_threshold_aed numeric(12,2) not null default 10000.00,
  payment_window_days int not null default 15,
  effective_from date not null default current_date,
  is_confirmed boolean not null default false,   -- false = still "proposed, pending confirmation"
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);
insert into mofaic_rules (id) values (1);

-- ============================================================
-- UPLOAD INTENTS — pre-registers an intended Storage upload so orphaned
-- objects (signed URL minted but never used, or used but the metadata RPC
-- never called) can be identified and cleaned up. See fn_register_upload_intent
-- / fn_cleanup_orphaned_uploads in 0002.
-- ============================================================
create table upload_intents (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  document_id uuid not null,
  storage_path text not null unique,
  requested_by uuid references profiles(id),
  expected_mime_type text,
  expected_file_size bigint,
  expected_sha256_hash text,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 hour',
  fulfilled boolean not null default false,
  fulfilled_at timestamptz,
  cleanup_status text not null default 'Pending',   -- Pending / Cleaned / Failed / NotNeeded
  cleanup_attempts int not null default 0,
  cleanup_last_attempted_at timestamptz,
  cleanup_error text
);
create index idx_upload_intents_expiry on upload_intents(expires_at) where not fulfilled;
create index idx_upload_intents_cleanup on upload_intents(cleanup_status) where not fulfilled;

-- ============================================================
-- TRIGGERS & FUNCTIONS: updated_at maintenance
-- ============================================================
create or replace function fn_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_shipments_updated_at on shipments;
create trigger trg_shipments_updated_at before update on shipments
  for each row execute function fn_set_updated_at();
drop trigger if exists trg_invoices_updated_at on invoices;
create trigger trg_invoices_updated_at before update on invoices
  for each row execute function fn_set_updated_at();
drop trigger if exists trg_exceptions_updated_at on exceptions;
create trigger trg_exceptions_updated_at before update on exceptions
  for each row execute function fn_set_updated_at();
drop trigger if exists trg_discovery_updated_at on discovery_items;
create trigger trg_discovery_updated_at before update on discovery_items
  for each row execute function fn_set_updated_at();
drop trigger if exists trg_branches_updated_at on branches;
create trigger trg_branches_updated_at before update on branches
  for each row execute function fn_set_updated_at();
drop trigger if exists trg_suppliers_updated_at on suppliers;
create trigger trg_suppliers_updated_at before update on suppliers
  for each row execute function fn_set_updated_at();

-- ============================================================
-- DELIVERY ORDER AUTO-DATE
-- ============================================================
create or replace function fn_delivery_order_received_date()
returns trigger language plpgsql as $$
begin
  if new.delivery_order_status = 'Received' and new.delivery_order_received_date is null then
    new.delivery_order_received_date := current_date;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_do_received_date on shipments;
create trigger trg_do_received_date
  before update of delivery_order_status on shipments
  for each row execute function fn_delivery_order_received_date();

-- ============================================================
-- COMPLETION ELIGIBILITY (NOT auto-completion — see architecture doc §14
-- for why this stops short of silently flipping overall_status)
-- ============================================================
create or replace function fn_check_completion_eligibility()
returns trigger language plpgsql
security definer
set search_path = ''
as $$
declare
  v_has_blocking_exception boolean;
  v_has_pending_resubmission boolean;
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

  new.completion_eligible :=
    new.overall_status = 'Received'
    and new.document_status in ('Complete','Verified')
    and new.customs_status in ('Approved','Closed')
    and new.municipality_status in ('Not Required','Finished')
    and new.delivery_order_status in ('Not Required','Verified')
    and new.mofaic_status in ('Not Applicable','Completed','Paid')
    and new.physical_doc_status in ('Not Required','Closed','Proof of Delivery Received')
    and not v_has_blocking_exception
    and not v_has_pending_resubmission;

  return new;
end;
$$;
revoke all on function fn_check_completion_eligibility() from public;
drop trigger if exists trg_completion_eligibility on shipments;
create trigger trg_completion_eligibility
  before insert or update of document_status, customs_status, municipality_status,
                             delivery_order_status, mofaic_status, physical_doc_status,
                             overall_status
  on shipments
  for each row execute function fn_check_completion_eligibility();

-- Notify the responsible user + coordinator the moment a shipment newly
-- becomes eligible (not on every save — only on the false -> true transition).
create or replace function fn_notify_completion_eligible()
returns trigger language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.completion_eligible and not coalesce(old.completion_eligible, false) then
    insert into public.notifications (recipient, shipment_id, event_type, title, message, priority, dedup_key)
    select p.id, new.id, 'completion_eligible',
           'Ready to complete: ' || new.ref,
           'All tracked sub-processes are finished for ' || new.ref || '. Review and confirm completion.',
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

-- ============================================================
-- RECALCULATE THE CACHED completion_eligible FLAG WHEN AN EXCEPTION OR
-- RESUBMISSION CHANGES — fixes the stale-cache defect: raising a new
-- Critical/High exception on an already-eligible shipment previously left
-- completion_eligible = true (since no column on `shipments` itself changed
-- and the BEFORE trigger above only fires on shipments' own column updates).
-- This trigger reaches back to the parent shipment and forces a recompute by
-- performing a no-op UPDATE that touches a column the BEFORE trigger already
-- watches, so the exact same eligibility logic runs — no duplicated rule set.
-- ============================================================
create or replace function fn_recalc_shipment_eligibility_from_exception()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shipment_id uuid;
begin
  v_shipment_id := coalesce(new.shipment_id, old.shipment_id);
  update public.shipments set overall_status = overall_status where id = v_shipment_id;
  return coalesce(new, old);
end;
$$;
revoke all on function fn_recalc_shipment_eligibility_from_exception() from public;

drop trigger if exists trg_recalc_eligibility_on_exception on exceptions;
create trigger trg_recalc_eligibility_on_exception
  after insert or update of severity, status on exceptions
  for each row execute function fn_recalc_shipment_eligibility_from_exception();

create or replace function fn_recalc_shipment_eligibility_from_resubmission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shipment_id uuid;
begin
  select shipment_id into v_shipment_id from public.exceptions
  where id = coalesce(new.exception_id, old.exception_id);
  update public.shipments set overall_status = overall_status where id = v_shipment_id;
  return coalesce(new, old);
end;
$$;
revoke all on function fn_recalc_shipment_eligibility_from_resubmission() from public;

drop trigger if exists trg_recalc_eligibility_on_resubmission on resubmission_attempts;
create trigger trg_recalc_eligibility_on_resubmission
  after insert or update of authority_result on resubmission_attempts
  for each row execute function fn_recalc_shipment_eligibility_from_resubmission();

-- ============================================================
-- GENERIC AUDIT TRIGGER
-- Fires on every mutating table so no write path can skip audit logging.
-- ============================================================
-- Computes a changed-field diff between two rows, as jsonb, rather than
-- storing complete before/after row dumps (item 13). Only keys whose value
-- actually differs are included, each as {"old": ..., "new": ...} — this
-- keeps audit_log rows small and focused on what actually changed, rather
-- than repeating every unchanged column on every single update.
create or replace function fn_jsonb_diff(p_old jsonb, p_new jsonb)
returns jsonb
language sql immutable
as $$
  select coalesce(
    jsonb_object_agg(key, jsonb_build_object('old', old_val, 'new', new_val)),
    '{}'::jsonb
  )
  from (
    select coalesce(o.key, n.key) as key, o.value as old_val, n.value as new_val
    from jsonb_each(coalesce(p_old, '{}'::jsonb)) o
    full outer join jsonb_each(coalesce(p_new, '{}'::jsonb)) n on o.key = n.key
    where o.value is distinct from n.value
  ) diffed;
$$;

create or replace function fn_audit_trigger()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  v_ref text;
  v_role public.app_role;
  v_comment text;
  v_correlation_id uuid;
  v_diff jsonb;
begin
  select role into v_role from public.profiles where id = auth.uid();

  if TG_TABLE_NAME = 'shipments' then
    v_ref := coalesce(new.ref, old.ref);
  elsif TG_TABLE_NAME in ('invoices','documents','shipment_comments','exceptions') then
    select ref into v_ref from public.shipments where id = coalesce(new.shipment_id, old.shipment_id);
  elsif TG_TABLE_NAME = 'document_versions' then
    select s.ref into v_ref from public.documents d join public.shipments s on s.id = d.shipment_id
      where d.id = coalesce(new.document_id, old.document_id);
  elsif TG_TABLE_NAME = 'resubmission_attempts' then
    select s.ref into v_ref from public.exceptions e join public.shipments s on s.id = e.shipment_id
      where e.id = coalesce(new.exception_id, old.exception_id);
  elsif TG_TABLE_NAME = 'notifications' then
    select ref into v_ref from public.shipments where id = coalesce(new.shipment_id, old.shipment_id);
  else
    v_ref := null;
  end if;

  v_comment := nullif(current_setting('app.audit_comment', true), '');
  v_correlation_id := nullif(current_setting('app.audit_correlation_id', true), '')::uuid;

  if TG_OP = 'UPDATE' then
    v_diff := public.fn_jsonb_diff(row_to_json(old)::jsonb, row_to_json(new)::jsonb);
  elsif TG_OP = 'INSERT' then
    v_diff := row_to_json(new)::jsonb;
  else
    v_diff := row_to_json(old)::jsonb;
  end if;

  insert into public.audit_log (actor, actor_role, action, module, shipment_ref, details, comment, correlation_id, source)
  values (
    auth.uid(), v_role, TG_OP, TG_TABLE_NAME, v_ref, v_diff, v_comment, v_correlation_id, 'trigger'
  );
  return coalesce(new, old);
end;
$$;
revoke all on function fn_audit_trigger() from public;

drop trigger if exists trg_audit_shipments on shipments;
create trigger trg_audit_shipments after insert or update or delete on shipments
  for each row execute function fn_audit_trigger();
drop trigger if exists trg_audit_invoices on invoices;
create trigger trg_audit_invoices after insert or update or delete on invoices
  for each row execute function fn_audit_trigger();
drop trigger if exists trg_audit_documents on documents;
create trigger trg_audit_documents after insert or update or delete on documents
  for each row execute function fn_audit_trigger();
drop trigger if exists trg_audit_document_versions on document_versions;
create trigger trg_audit_document_versions after insert or update or delete on document_versions
  for each row execute function fn_audit_trigger();
drop trigger if exists trg_audit_exceptions on exceptions;
create trigger trg_audit_exceptions after insert or update or delete on exceptions
  for each row execute function fn_audit_trigger();
drop trigger if exists trg_audit_resubmissions on resubmission_attempts;
create trigger trg_audit_resubmissions after insert or update or delete on resubmission_attempts
  for each row execute function fn_audit_trigger();
drop trigger if exists trg_audit_comments on shipment_comments;
create trigger trg_audit_comments after insert on shipment_comments
  for each row execute function fn_audit_trigger();
drop trigger if exists trg_audit_discovery on discovery_items;
create trigger trg_audit_discovery after insert or update on discovery_items
  for each row execute function fn_audit_trigger();
drop trigger if exists trg_audit_profiles on profiles;
create trigger trg_audit_profiles after update on profiles
  for each row execute function fn_audit_trigger();
-- Item 13 additions: roles/permissions, master data (suppliers is the
-- built representative admin RPC — the same trigger pattern extends
-- identically to the other 13 master tables once their admin RPCs are
-- built in Phase 5), imports, and notifications.
drop trigger if exists trg_audit_role_permissions on role_permissions;
create trigger trg_audit_role_permissions after insert or update or delete on role_permissions
  for each row execute function fn_audit_trigger();
drop trigger if exists trg_audit_suppliers on suppliers;
create trigger trg_audit_suppliers after insert or update on suppliers
  for each row execute function fn_audit_trigger();
drop trigger if exists trg_audit_import_batches on import_batches;
create trigger trg_audit_import_batches after insert or update on import_batches
  for each row execute function fn_audit_trigger();
drop trigger if exists trg_audit_notifications on notifications;
create trigger trg_audit_notifications after insert on notifications
  for each row execute function fn_audit_trigger();
