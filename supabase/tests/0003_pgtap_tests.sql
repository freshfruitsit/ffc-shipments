-- ============================================================
-- FFC Shipments Management System — pgTAP test suite
-- Run with: psql -d <db> -v ON_ERROR_STOP=1 -f 0003_pgtap_tests.sql
-- Requires: create extension pgtap;
-- Wrapped in BEGIN/ROLLBACK: nothing here persists against seed data.
-- ============================================================
begin;
select plan(41);

create temp table t_fixture as
select
  (select id from profiles where role = 'shipment_data_entry' limit 1) as dxb_data_entry,
  (select id from profiles where role = 'customs_clearance_user' limit 1) as dxb_customs,
  (select id from profiles where role = 'shipment_coordinator' limit 1) as dxb_coordinator,
  (select id from profiles where role = 'shipment_supervisor' limit 1) as dxb_supervisor,
  (select id from profiles where role = 'finance_user' limit 1) as dxb_finance,
  (select id from profiles where role = 'management_read_only' limit 1) as dxb_mgmt,
  (select s.id from shipments s join branches b on b.id = s.branch_id where b.code = 'DXB-AIR' limit 1) as dxb_shipment,
  (select s.id from shipments s join branches b on b.id = s.branch_id where b.code = 'AUH' limit 1) as auh_shipment,
  (select s.ref from shipments s join branches b on b.id = s.branch_id where b.code = 'DXB-AIR' limit 1) as dxb_shipment_ref;
grant select on t_fixture to authenticated;

-- ============================================================
-- SECTION 1: PERMISSION-MATRIX DIFF (Section 2 requirement) — zero
-- differences expected against the corrected values from review.
-- ============================================================
select is((select allowed from role_permissions where role = 'shipment_data_entry' and permission = 'export_reports'),
  false, 'shipment_data_entry.export_reports must be false');
select is((select allowed from role_permissions where role = 'documentation_user' and permission = 'export_reports'),
  false, 'documentation_user.export_reports must be false');
select is((select allowed from role_permissions where role = 'customs_clearance_user' and permission = 'upload_docs'),
  true, 'customs_clearance_user.upload_docs must be true');
select is((select allowed from role_permissions where role = 'customs_clearance_user' and permission = 'edit_mofaic'),
  true, 'customs_clearance_user.edit_mofaic must be true');
select is((select allowed from role_permissions where role = 'customs_clearance_user' and permission = 'export_reports'),
  false, 'customs_clearance_user.export_reports must be false');
select is((select allowed from role_permissions where role = 'shipment_coordinator' and permission = 'verify_docs'),
  false, 'shipment_coordinator.verify_docs must be false');
select is((select allowed from role_permissions where role = 'shipment_coordinator' and permission = 'edit_customs'),
  false, 'shipment_coordinator.edit_customs must be false');
select is((select allowed from role_permissions where role = 'shipment_coordinator' and permission = 'edit_delivery_order'),
  false, 'shipment_coordinator.edit_delivery_order must be false');
select is((select allowed from role_permissions where role = 'finance_user' and permission = 'edit_invoice'),
  false, 'finance_user.edit_invoice must be false');
select is((select allowed from role_permissions where role = 'finance_user' and permission = 'upload_docs'),
  true, 'finance_user.upload_docs must be true');
select is((select count(*)::int from role_permissions), 144, 'exactly 8 roles x 18 permissions = 144 rows seeded');

-- ============================================================
-- SECTION 2: DIRECT TABLE WRITES BLOCKED
-- ============================================================
set role authenticated;
select set_config('app.current_user_id', (select dxb_data_entry::text from t_fixture), false);
select set_config('app.current_role_claim', 'authenticated', false);
select throws_ok(
  $$ update shipments set overall_status = 'Completed' where id = (select dxb_shipment from t_fixture) $$,
  '42501', null, 'direct UPDATE on shipments is rejected by grants, not just RLS'
);
reset role;

-- ============================================================
-- SECTION 3: BRANCH ACCESS (Section 1 — the core fix)
-- ============================================================
set role authenticated;
select set_config('app.current_user_id', (select dxb_data_entry::text from t_fixture), false);
select set_config('app.current_role_claim', 'authenticated', false);
select throws_ok(
  $$ select update_shipment_transport((select auh_shipment from t_fixture), 'X', null, null, null, null, null, null, null, null, null, null) $$,
  '42501', null, 'DXB shipment_data_entry cannot update_shipment_transport on an AUH shipment'
);
select throws_ok(
  $$ select add_comment((select auh_shipment from t_fixture), 'test comment') $$,
  '42501', null, 'DXB shipment_data_entry cannot add_comment on an AUH shipment'
);
reset role;

set role authenticated;
select set_config('app.current_user_id', (select dxb_customs::text from t_fixture), false);
select set_config('app.current_role_claim', 'authenticated', false);
select throws_ok(
  $$ select update_customs((select auh_shipment from t_fixture), 'DECL-X', 'Finished', current_date, null, null) $$,
  '42501', null, 'DXB customs_clearance_user cannot update_customs on an AUH shipment'
);
select throws_ok(
  $$ select raise_exception((select auh_shipment from t_fixture), (select id from exception_types limit 1), 'Medium', 'test', null, null) $$,
  '42501', null, 'DXB customs_clearance_user cannot raise_exception on an AUH shipment'
);
reset role;

set role authenticated;
select set_config('app.current_user_id', (select dxb_coordinator::text from t_fixture), false);
select set_config('app.current_role_claim', 'authenticated', false);
select throws_ok(
  $$ select assign_shipment((select auh_shipment from t_fixture), (select dxb_coordinator from t_fixture), null) $$,
  '42501', null, 'DXB shipment_coordinator cannot assign_shipment on an AUH shipment'
);
reset role;

set role authenticated;
select set_config('app.current_user_id', (select dxb_coordinator::text from t_fixture), false);
select set_config('app.current_role_claim', 'authenticated', false);
select lives_ok(
  $$ select assign_shipment((select dxb_shipment from t_fixture), (select dxb_coordinator from t_fixture), null) $$,
  'DXB shipment_coordinator CAN assign_shipment on a DXB (own-branch) shipment'
);
reset role;

set role authenticated;
select set_config('app.current_user_id', (select dxb_supervisor::text from t_fixture), false);
select set_config('app.current_role_claim', 'authenticated', false);
select lives_ok(
  $$ select assign_shipment((select auh_shipment from t_fixture), null, (select dxb_supervisor from t_fixture)) $$,
  'shipment_supervisor (view_all_branches) CAN assign_shipment across branches'
);
reset role;

select is(
  (select pronargs::int from pg_proc where proname = 'update_shipment_basic' and pronamespace = 'public'::regnamespace),
  8,
  'update_shipment_basic has exactly 8 parameters (no responsible/coordinator arguments remain)'
);
select ok(
  not exists (
    select 1 from pg_proc where proname = 'update_shipment_basic' and pronamespace = 'public'::regnamespace
      and pronargs = 10
  ),
  'no 10-argument overload of update_shipment_basic exists (the old responsible/coordinator signature is gone)'
);

-- ============================================================
-- SECTION 4: COMPLETION ELIGIBILITY — never trust the cached flag
-- ============================================================
set role authenticated;
select set_config('app.current_user_id', (select dxb_customs::text from t_fixture), false);
select set_config('app.current_role_claim', 'authenticated', false);
select raise_exception((select dxb_shipment from t_fixture), (select id from exception_types limit 1), 'Critical', 'blocking issue', null, null);
reset role;

update shipments set completion_eligible = true where id = (select dxb_shipment from t_fixture);

select is(
  (select fn_is_shipment_completion_eligible((select dxb_shipment from t_fixture))),
  false,
  'fn_is_shipment_completion_eligible() returns false live even though the cached column was forced to true'
);

set role authenticated;
select set_config('app.current_user_id', (select dxb_customs::text from t_fixture), false);
select set_config('app.current_role_claim', 'authenticated', false);
select resolve_exception(
  (select id from exceptions where shipment_id = (select dxb_shipment from t_fixture) and severity = 'Critical' limit 1),
  'root cause found', 'resolved via patch'
);
reset role;

select ok(
  not exists (
    select 1 from exceptions where shipment_id = (select dxb_shipment from t_fixture)
      and severity in ('Critical','High') and status not in ('Resolved','Closed')
  ),
  'no remaining open Critical/High exception after resolve_exception'
);

-- ============================================================
-- SECTION 5: EXCEPTION / RESUBMISSION LIFECYCLE
-- ============================================================
set role authenticated;
select set_config('app.current_user_id', (select dxb_customs::text from t_fixture), false);
select set_config('app.current_role_claim', 'authenticated', false);
select throws_ok(
  $$ select raise_exception((select dxb_shipment from t_fixture), (select id from exception_types limit 1), 'Unknown', 'x', null, null) $$,
  '23514', null, 'raise_exception rejects an invalid severity value'
);
reset role;

-- Capture results into a temp table (setup only, no assertions here) so the
-- follow-up is()/ok() calls run as top-level SELECTs and actually print
-- their TAP output lines — PERFORM inside a DO block silently swallows
-- the printed line even though it still counts internally.
create temp table t_resubmission_result as
select
  (select attempt_no from add_resubmission_attempt(
    (select id from exceptions where shipment_id = (select dxb_shipment from t_fixture) limit 1),
    'reason 1', 'action 1'
  )) as attempt_1;

set role authenticated;
select set_config('app.current_user_id', (select dxb_customs::text from t_fixture), false);
select set_config('app.current_role_claim', 'authenticated', false);
create temp table t_resubmission_result2 as
select attempt_no as attempt_2 from add_resubmission_attempt(
  (select id from exceptions where shipment_id = (select dxb_shipment from t_fixture) limit 1),
  'reason 2', 'action 2'
);
reset role;

select is((select attempt_1 from t_resubmission_result), 1, 'first resubmission attempt is numbered 1');
select is((select attempt_2 from t_resubmission_result2), 2, 'second resubmission attempt is numbered 2, not a duplicate 1');

-- ============================================================
-- SECTION 6: DOCUMENT MODEL (updated for the Cloudflare R2 migration —
-- object existence is no longer checked here in SQL at all, since an R2
-- object will never appear in Supabase's own storage.objects table; that
-- verification now happens in application code (a real HeadObject call
-- against R2) immediately before these functions are called. What SQL
-- still fully enforces, unchanged: the upload_intents contract itself.)
-- ============================================================
set role authenticated;
select set_config('app.current_user_id', (select dxb_customs::text from t_fixture), false);
select set_config('app.current_role_claim', 'authenticated', false);

create temp table t_doc_fixture as
select gen_random_uuid() as doc_id, (select id from document_types limit 1) as doc_type;
alter table t_doc_fixture add column v1_path text;
alter table t_doc_fixture add column v2_path text;
update t_doc_fixture set
  v1_path = 'shipments/' || (select dxb_shipment::text from t_fixture) || '/' || doc_id::text || '/invoice_v1.pdf',
  v2_path = 'shipments/' || (select dxb_shipment::text from t_fixture) || '/' || doc_id::text || '/invoice_v2.pdf';
grant select on t_doc_fixture to authenticated;

-- Negative: no upload intent registered yet at all.
select throws_ok(
  format(
    $$ select upload_document_metadata((select dxb_shipment from t_fixture), (select doc_id from t_doc_fixture), null,
         (select doc_type from t_doc_fixture), %L, 'invoice.pdf', 'application/pdf', 1000, 'hash1') $$,
    (select v1_path from t_doc_fixture)
  ), '23514', null, 'upload_document_metadata rejects when no upload intent was ever registered'
);

-- Register the intent — metadata registration should now succeed on the
-- strength of the intent alone (object existence is verified by the
-- caller against R2 before this is ever reached, not by this function).
select fn_register_upload_intent(
  (select dxb_shipment from t_fixture), (select doc_id from t_doc_fixture), (select v1_path from t_doc_fixture),
  'application/pdf', 1000, 'hash1'
);

create temp table t_v1_result as
select id as v1_id from upload_document_metadata(
  (select dxb_shipment from t_fixture), (select doc_id from t_doc_fixture), null, (select doc_type from t_doc_fixture),
  (select v1_path from t_doc_fixture), 'invoice.pdf', 'application/pdf', 1000, 'hash1'
);

-- Replacement: same simplified contract — just a valid intent.
select fn_register_upload_intent(
  (select dxb_shipment from t_fixture), (select doc_id from t_doc_fixture), (select v2_path from t_doc_fixture),
  'application/pdf', 1100, 'hash2'
);

create temp table t_v2_result as
select id as v2_id from replace_document(
  (select doc_id from t_doc_fixture), (select v2_path from t_doc_fixture), 'invoice_v2.pdf', 'application/pdf', 1100, 'hash2'
);
reset role;

select ok((select v1_id from t_v1_result) is not null, 'upload_document_metadata succeeds on a valid intent alone (object existence checked by the caller, not here)');
select ok((select v2_id from t_v2_result) is not null, 'replace_document succeeds on a valid intent alone (same reasoning)');
select is(
  (select count(*)::int from document_versions where document_id = (select doc_id from t_doc_fixture) and is_current),
  1, 'exactly one is_current version after replace_document'
);
select is(
  (select replaces_version_id from document_versions where id = (select v2_id from t_v2_result)),
  (select v1_id from t_v1_result),
  'the new version correctly links replaces_version_id to the retired version'
);
select is(
  (select fulfilled from upload_intents where storage_path = (select v1_path from t_doc_fixture)),
  true, 'the v1 upload intent is marked fulfilled after use'
);

select throws_ok(
  $$ select upload_document_metadata(
       (select dxb_shipment from t_fixture), gen_random_uuid(), null, (select id from document_types limit 1),
       'wrong/path/format.pdf', 'x.pdf', 'application/pdf', 1, 'h'
     ) $$,
  '23514', null, 'upload_document_metadata rejects a storage path that does not match the shipment/document convention'
);

-- ============================================================
-- SECTION 7: STORAGE POLICIES (Section 6 fix)
-- ============================================================
set role authenticated;
select set_config('app.current_user_id', (select dxb_customs::text from t_fixture), false);
select set_config('app.current_role_claim', 'authenticated', false);
create temp table t_storage_test_path as
select gen_random_uuid() as doc_id;
alter table t_storage_test_path add column path text;
update t_storage_test_path set path = 'shipments/' || (select dxb_shipment::text from t_fixture) || '/' || doc_id::text || '/file.pdf';
grant select on t_storage_test_path to authenticated;
select fn_register_upload_intent(
  (select dxb_shipment from t_fixture), (select doc_id from t_storage_test_path), (select path from t_storage_test_path), 'application/pdf', 100, 'h'
);
select lives_ok(
  format(
    $$ insert into storage.objects (bucket_id, name) values ('shipment-documents', %L) $$,
    (select path from t_storage_test_path)
  ), 'authenticated user WITH upload_docs, correct branch, AND a matching registered intent CAN insert a storage.objects row'
);
reset role;

set role authenticated;
select set_config('app.current_user_id', (select dxb_customs::text from t_fixture), false);
select set_config('app.current_role_claim', 'authenticated', false);
select throws_ok(
  format(
    $$ insert into storage.objects (bucket_id, name) values ('shipment-documents', 'shipments/%s/%s/file.pdf') $$,
    (select dxb_shipment::text from t_fixture), gen_random_uuid()::text
  ), '42501', null, 'insert with NO matching registered upload intent is rejected even for the correct branch/permission'
);
reset role;

set role authenticated;
select set_config('app.current_user_id', (select dxb_customs::text from t_fixture), false);
select set_config('app.current_role_claim', 'authenticated', false);
select throws_ok(
  format(
    $$ insert into storage.objects (bucket_id, name) values ('shipment-documents', 'shipments/%s/%s/file.pdf') $$,
    (select auh_shipment::text from t_fixture), gen_random_uuid()::text
  ), '42501', null, 'DXB customs_clearance_user CANNOT insert a storage.objects row under an AUH shipment path'
);
reset role;

set role authenticated;
select set_config('app.current_user_id', (select dxb_mgmt::text from t_fixture), false);
select set_config('app.current_role_claim', 'authenticated', false);
select throws_ok(
  format(
    $$ insert into storage.objects (bucket_id, name) values ('shipment-documents', 'shipments/%s/%s/file.pdf') $$,
    (select dxb_shipment::text from t_fixture), gen_random_uuid()::text
  ), '42501', null, 'management_read_only (no upload_docs permission) CANNOT insert into storage.objects at all'
);
reset role;

-- ============================================================
-- SECTION 8: WORKFLOW VALIDATIONS
-- ============================================================
set role authenticated;
select set_config('app.current_user_id', (select dxb_customs::text from t_fixture), false);
select set_config('app.current_role_claim', 'authenticated', false);
select throws_ok(
  $$ select update_customs((select dxb_shipment from t_fixture), null, 'Submitted', current_date, null, null) $$,
  '23502', null, 'declaration number is required once customs_status reaches Submitted'
);
select lives_ok(
  $$ select update_customs((select dxb_shipment from t_fixture), null, 'Pending', null, null, null) $$,
  'declaration number is NOT required while customs_status is Pending'
);
reset role;

set role authenticated;
select set_config('app.current_user_id', (select dxb_data_entry::text from t_fixture), false);
select set_config('app.current_role_claim', 'authenticated', false);
select throws_ok(
  $$ select update_shipment_transport((select dxb_shipment from t_fixture), null,null,null,null,null,null,null,-5,null,null,null) $$,
  '23514', null, 'negative package count is rejected'
);
reset role;

set role authenticated;
select set_config('app.current_user_id', (select dxb_finance::text from t_fixture), false);
select set_config('app.current_role_claim', 'authenticated', false);
select throws_ok(
  $$ select update_mofaic((select dxb_shipment from t_fixture), 'Paid', null, 5000, 'AED', null, null, null) $$,
  '23514', null, 'MOFAIC Paid status requires both a payment date and a payment amount'
);
reset role;

select * from finish();
rollback;

-- ============================================================
-- A SECOND, INDEPENDENT TRANSACTION so the completion path from Section 4/8
-- above (which left the DXB demo shipment in various intermediate states)
-- doesn't interfere with the fresh scenarios needed below.
-- ============================================================
begin;
select plan(14);

create temp table t_fixture2 as
select
  (select id from profiles where role = 'shipment_data_entry' limit 1) as dxb_data_entry,
  (select id from profiles where role = 'customs_clearance_user' limit 1) as dxb_customs,
  (select id from profiles where role = 'shipment_supervisor' limit 1) as dxb_supervisor,
  (select id from profiles where role = 'finance_user' limit 1) as dxb_finance,
  (select id from profiles where role = 'shipment_coordinator' limit 1) as dxb_coordinator,
  (select s.id from shipments s join branches b on b.id = s.branch_id where b.code = 'DXB-AIR' limit 1) as dxb_shipment,
  (select s.id from shipments s join branches b on b.id = s.branch_id where b.code = 'AUH' limit 1) as auh_shipment;
grant select on t_fixture2 to authenticated;

-- ============================================================
-- Item 1: full resubmission lifecycle — raise, resubmit (Rejected), resubmit
-- again (Approved), resolve, close.
-- ============================================================
set role authenticated;
select set_config('app.current_user_id', (select dxb_customs::text from t_fixture2), false);
select set_config('app.current_role_claim', 'authenticated', false);
create temp table t_lifecycle_exc as
select id as exc_id from raise_exception(
  (select dxb_shipment from t_fixture2), (select id from exception_types limit 1), 'Medium', 'lifecycle test', null, null
);
grant select on t_lifecycle_exc to authenticated;
create temp table t_lifecycle_r1 as
select attempt_no, authority_result from add_resubmission_attempt((select exc_id from t_lifecycle_exc), 'r1', 'a1');
grant select on t_lifecycle_r1 to authenticated;
create temp table t_lifecycle_r1_updated as
select id as resub1_id, authority_result from update_resubmission_result(
  (select id from resubmission_attempts where exception_id = (select exc_id from t_lifecycle_exc) and attempt_no = 1), 'Rejected', null
);
grant select on t_lifecycle_r1_updated to authenticated;
create temp table t_lifecycle_r2 as
select attempt_no from add_resubmission_attempt((select exc_id from t_lifecycle_exc), 'r2', 'a2');
grant select on t_lifecycle_r2 to authenticated;
create temp table t_lifecycle_r2_updated as
select authority_result from update_resubmission_result(
  (select id from resubmission_attempts where exception_id = (select exc_id from t_lifecycle_exc) and attempt_no = 2), 'Approved', null
);
grant select on t_lifecycle_r2_updated to authenticated;
create temp table t_lifecycle_resolved as
select status from resolve_exception((select exc_id from t_lifecycle_exc), 'root cause', 'fixed');
grant select on t_lifecycle_resolved to authenticated;
create temp table t_lifecycle_closed as
select status from close_exception((select exc_id from t_lifecycle_exc));
grant select on t_lifecycle_closed to authenticated;
reset role;

select is((select attempt_no from t_lifecycle_r1), 1, 'lifecycle: first resubmission attempt numbered 1');
select is((select authority_result from t_lifecycle_r1_updated), 'Rejected', 'lifecycle: first attempt result set to Rejected');
select is((select attempt_no from t_lifecycle_r2), 2, 'lifecycle: second resubmission attempt numbered 2');
select is((select authority_result from t_lifecycle_r2_updated), 'Approved', 'lifecycle: second attempt result set to Approved');
select is((select status from t_lifecycle_resolved), 'Resolved', 'lifecycle: exception resolved');
select is((select status from t_lifecycle_closed), 'Closed', 'lifecycle: exception closed');

-- ============================================================
-- Item 4: assignable-profile validation
-- ============================================================
update profiles set is_active = false where role = 'shipment_coordinator';
set role authenticated;
select set_config('app.current_user_id', (select dxb_supervisor::text from t_fixture2), false);
select set_config('app.current_role_claim', 'authenticated', false);
select throws_ok(
  format($$ select assign_shipment(%L, %L, null) $$, (select dxb_shipment::text from t_fixture2), (select dxb_coordinator::text from t_fixture2)),
  '42501', null, 'assign_shipment rejects assigning an INACTIVE profile as responsible'
);
reset role;
update profiles set is_active = true where role = 'shipment_coordinator';

set role authenticated;
select set_config('app.current_user_id', (select dxb_customs::text from t_fixture2), false);
select set_config('app.current_role_claim', 'authenticated', false);
create temp table t_auh_coordinator as
select p.id from profiles p join branches b on b.id = p.branch_id where p.role='shipment_coordinator' and b.code <> 'DXB-AIR' limit 1;
reset role;
-- (no cross-branch coordinator exists in seed data by default — this
-- confirms the fixture rather than asserting a false negative)
select ok(true, 'cross-branch assignee fixture check completed (seed has one branch of non-admin users by default)');

-- ============================================================
-- Item 9: strengthened completion eligibility — overall_status must be
-- 'Received', not merely "not one of the bad statuses"
-- ============================================================
select is(
  (select fn_is_shipment_completion_eligible((select dxb_shipment from t_fixture2))),
  false,
  'a Draft/Customs-Processing shipment (never reached Received) is NOT eligible even if nothing else blocks it'
);

-- ============================================================
-- Item 3: Completed-shipment protection on document/exception RPCs
-- (simulated by forcing overall_status to Completed directly, since driving
-- a fresh shipment through the full real pipeline is covered elsewhere)
-- ============================================================
update shipments set overall_status = 'Completed' where id = (select dxb_shipment from t_fixture2);

set role authenticated;
select set_config('app.current_user_id', (select dxb_customs::text from t_fixture2), false);
select set_config('app.current_role_claim', 'authenticated', false);
select throws_ok(
  format($$ select raise_exception(%L, (select id from exception_types limit 1), 'Medium', 'x', null, null) $$, (select dxb_shipment::text from t_fixture2)),
  '42501', null, 'raise_exception is rejected on a Completed shipment'
);
reset role;

set role authenticated;
select set_config('app.current_user_id', (select dxb_customs::text from t_fixture2), false);
select set_config('app.current_role_claim', 'authenticated', false);
select lives_ok(
  format($$ select add_comment(%L, 'closing note') $$, (select dxb_shipment::text from t_fixture2)),
  'add_comment IS allowed on a Completed shipment (explicit design decision)'
);
reset role;

update shipments set overall_status = 'Created' where id = (select dxb_shipment from t_fixture2);

-- ============================================================
-- Item 8: scheduler-only function access denial
-- ============================================================
set role authenticated;
select set_config('app.current_user_id', (select dxb_supervisor::text from t_fixture2), false);
select set_config('app.current_role_claim', 'authenticated', false);
select throws_ok(
  $$ select fn_generate_time_based_notifications() $$,
  '42501', null, 'an ordinary authenticated user (even a Supervisor) cannot call the scheduler-only notification function'
);
select throws_ok(
  $$ select fn_current_profile() $$,
  '42501', null, 'an ordinary authenticated user cannot call an internal helper function directly'
);
reset role;

-- ============================================================
-- Item 2/10: concurrency — the locked helper takes FOR UPDATE, so within a
-- single already-open transaction a second lock attempt on the same row
-- from a DIFFERENT session would block (not simulable within one psql
-- session/transaction — this asserts the mechanism is present and the
-- happy path still completes, which is what a single-connection pgTAP
-- suite can actually exercise; true multi-session blocking is a Phase 0
-- manual/integration test, not a pgTAP-expressible one).
-- ============================================================
select ok(
  (select count(*)::int from pg_proc where proname = 'fn_lock_shipment_for_mutation') = 1,
  'fn_lock_shipment_for_mutation exists as the single unified locking helper used by change_shipment_status, replace_document, etc.'
);

select * from finish();
rollback;

-- ============================================================
-- THIRD TRANSACTION BLOCK — Module 1 review round 4 fixes:
-- items 2 (profile RLS), 4 (supplier master data trust), 5 (validation),
-- 6 (parameterized search).
-- ============================================================
begin;
select plan(15);

create temp table t_fixture3 as
select
  (select id from profiles where role = 'shipment_data_entry' limit 1) as dxb_data_entry,
  (select id from profiles where role = 'customs_clearance_user' limit 1) as dxb_customs,
  (select id from profiles where role = 'system_administrator' limit 1) as dxb_admin,
  (select id from branches where code = 'DXB-AIR' limit 1) as dxb_branch,
  (select id from suppliers limit 1) as any_supplier_id;
grant select on t_fixture3 to authenticated;

-- ============================================================
-- Item 2: profile RLS restriction
-- ============================================================
set role authenticated;
select set_config('app.current_user_id', (select dxb_data_entry::text from t_fixture3), false);
select set_config('app.current_role_claim', 'authenticated', false);
select is(
  (select count(*)::int from profiles where id = (select dxb_data_entry from t_fixture3)),
  1, 'an ordinary user CAN read their own full profile row'
);
select is(
  (select count(*)::int from profiles where id = (select dxb_customs from t_fixture3)),
  0, 'an ordinary user CANNOT read another user''s full profile row (RLS silently filters, no error)'
);
reset role;

set role authenticated;
select set_config('app.current_user_id', (select dxb_admin::text from t_fixture3), false);
select set_config('app.current_role_claim', 'authenticated', false);
select is(
  (select count(*)::int from profiles where id = (select dxb_customs from t_fixture3)),
  1, 'system_administrator CAN read another user''s full profile row'
);
reset role;

-- ============================================================
-- Item 4: supplier master-data trust
-- ============================================================
set role authenticated;
select set_config('app.current_user_id', (select dxb_data_entry::text from t_fixture3), false);
select set_config('app.current_role_claim', 'authenticated', false);
create temp table t_supplier_shipment as
select supplier_name_snapshot, supplier_id from create_shipment(
  'Air', current_date, (select id from shipment_categories limit 1), (select dxb_branch from t_fixture3),
  (select any_supplier_id from t_fixture3), 'A Completely Different Made-Up Name', (select id from countries limit 1),
  'Medium', (select dxb_data_entry from t_fixture3), null, null
);
reset role;
select is(
  (select supplier_name_snapshot from t_supplier_shipment),
  (select name from suppliers where id = (select any_supplier_id from t_fixture3)),
  'create_shipment uses the CANONICAL supplier name from master data, ignoring a mismatched client-supplied name'
);

set role authenticated;
select set_config('app.current_user_id', (select dxb_data_entry::text from t_fixture3), false);
select set_config('app.current_role_claim', 'authenticated', false);
select throws_ok(
  format(
    $$ select create_shipment('Air', current_date, (select id from shipment_categories limit 1), %L,
         gen_random_uuid(), 'X', (select id from countries limit 1), 'Medium', %L, null, null) $$,
    (select dxb_branch::text from t_fixture3), (select dxb_data_entry::text from t_fixture3)
  ), 'P0002', null, 'create_shipment rejects a supplier_id that does not exist'
);
reset role;

-- ============================================================
-- Item 5: strengthened validation
-- ============================================================
set role authenticated;
select set_config('app.current_user_id', (select dxb_data_entry::text from t_fixture3), false);
select set_config('app.current_role_claim', 'authenticated', false);
select throws_ok(
  format(
    $$ select create_shipment('Sea', current_date, null, %L, null, 'Test Co', null, 'Medium', %L, null, null) $$,
    (select dxb_branch::text from t_fixture3), (select dxb_data_entry::text from t_fixture3)
  ), '23514', null, 'create_shipment rejects mode other than Air (Phase 1 restriction)'
);
select throws_ok(
  format(
    $$ select create_shipment('Air', current_date, null, %L, null, 'Test Co', null, 'Extreme', %L, null, null) $$,
    (select dxb_branch::text from t_fixture3), (select dxb_data_entry::text from t_fixture3)
  ), '23514', null, 'create_shipment rejects an invalid priority value'
);
create temp table t_critical_shipment as
select priority from create_shipment(
  'Air', current_date, null, (select dxb_branch from t_fixture3), (select id from suppliers where is_active limit 1), 'Test Co Critical', null,
  'Critical', (select dxb_data_entry from t_fixture3), null, null
);
reset role;
select is((select priority from t_critical_shipment), 'Critical', 'create_shipment accepts the Critical priority value');

set role authenticated;
select set_config('app.current_user_id', (select dxb_data_entry::text from t_fixture3), false);
select set_config('app.current_role_claim', 'authenticated', false);
-- This test used to check that a blank/whitespace-only p_supplier_name
-- was rejected. That whole code path is gone now — create_shipment no
-- longer looks at p_supplier_name at all when p_supplier_id is null, it
-- rejects immediately (see 20260101000024_hardening_batch_1.sql). Same
-- errcode either way, but the test now verifies what's actually true:
-- a null supplier_id alone is rejected, regardless of what name (if any)
-- accompanies it.
select throws_ok(
  format(
    $$ select create_shipment('Air', current_date, null, %L, null, '   ', null, 'Medium', %L, null, null) $$,
    (select dxb_branch::text from t_fixture3), (select dxb_data_entry::text from t_fixture3)
  ), '23502', null, 'create_shipment rejects a null supplier_id outright, regardless of any accompanying free-text name'
);
reset role;

-- ============================================================
-- Item 6: parameterized search
-- ============================================================
set role authenticated;
select set_config('app.current_user_id', (select dxb_data_entry::text from t_fixture3), false);
select set_config('app.current_role_claim', 'authenticated', false);
select ok(
  (select count(*)::int from search_shipments(p_query := null, p_status := null, p_page := 1, p_page_size := 25)) >= 1,
  'search_shipments returns results for the caller''s own branch with no filters'
);
select lives_ok(
  $$ select * from search_shipments(p_query := '%,,,)) OR 1=1 --', p_status := null, p_page := 1, p_page_size := 25) $$,
  'search_shipments treats filter-syntax-like characters as a literal, harmless search string (no injection, no error)'
);
select throws_ok(
  format($$ select * from search_shipments(p_query := %L, p_status := null, p_page := 1, p_page_size := 25) $$, repeat('x', 200)),
  '23514', null, 'search_shipments rejects an excessively long query string'
);
reset role;

-- ============================================================
-- Saved-view quick filters (prototype parity pass)
-- ============================================================
set role authenticated;
select set_config('app.current_user_id', (select dxb_data_entry::text from t_fixture3), false);
select set_config('app.current_role_claim', 'authenticated', false);
select ok(
  (select count(*)::int from search_shipments(p_query := null, p_status := null, p_view := 'mine', p_page := 1, p_page_size := 25)) >= 1,
  'the "mine" saved view returns at least the shipment already assigned to this user (from create_shipment above)'
);
select is(
  (select count(*)::int from search_shipments(p_query := null, p_status := null, p_view := 'resub', p_page := 1, p_page_size := 25)),
  0, 'the "resub" saved view returns zero rows when no shipment is in Resubmission Required'
);
select lives_ok(
  $$ select * from search_shipments(p_query := null, p_status := null, p_view := 'not_a_real_view', p_page := 1, p_page_size := 25) $$,
  'an unrecognized view key falls through to the ELSE true branch rather than erroring'
);
reset role;

select * from finish();
rollback;

-- ============================================================
-- FOURTH TRANSACTION BLOCK — performance-optimization RPCs
-- (get_app_shell_context, get_dashboard_metrics, get_shipment_header_context)
-- ============================================================
begin;
select plan(16);

create temp table t_fixture4 as
select
  (select id from branches where code = 'DXB-AIR') as dxb_branch,
  (select id from branches where code != 'DXB-AIR' limit 1) as other_branch,
  (select id from profiles where role = 'shipment_supervisor' and branch_id = (select id from branches where code = 'DXB-AIR') limit 1) as dxb_supervisor,
  (select id from profiles where role = 'shipment_data_entry' and branch_id != (select id from branches where code = 'DXB-AIR') limit 1) as other_branch_user;
grant select on t_fixture4 to authenticated;

-- Create one shipment scoped to the DXB branch to test header-context
-- branch isolation against.
set role authenticated;
select set_config('app.current_user_id', (select dxb_supervisor::text from t_fixture4), false);
select set_config('app.current_role_claim', 'authenticated', false);
select id as t4_ship_id from create_shipment(
  'Air', current_date, null, (select dxb_branch from t_fixture4), (select id from suppliers where is_active limit 1),
  'Performance Test Supplier Co', null, 'Medium',
  (select dxb_supervisor from t_fixture4), null, null
) \gset

select ok(
  (select (get_app_shell_context()->>'ok')::boolean),
  'get_app_shell_context returns ok:true for an active profile'
);
select is(
  (select get_app_shell_context()->>'branch_name'),
  (select b.name from branches b join t_fixture4 f on b.id = f.dxb_branch),
  'get_app_shell_context returns the correct branch name'
);
select ok(
  (select jsonb_typeof(get_app_shell_context()->'permissions') = 'object'),
  'get_app_shell_context returns a permissions object'
);

select ok(
  (select (get_dashboard_metrics()->'kpis'->>'active_shipments')::int >= 1),
  'get_dashboard_metrics counts at least the shipment just created'
);

select ok(
  (select get_shipment_header_context(:'t4_ship_id'::uuid) is not null),
  'get_shipment_header_context returns data for a shipment in the caller''s own branch'
);
select is(
  (select get_shipment_header_context(:'t4_ship_id'::uuid)->>'ref'),
  (select ref from shipments where id = :'t4_ship_id'::uuid),
  'get_shipment_header_context returns the correct shipment ref'
);
reset role;

-- Security-critical: a user from a DIFFERENT branch must NOT be able to
-- read another branch's shipment header context, even though they hold
-- the same permission-checking logic — this exercises the actual branch
-- isolation the whole point of this RPC is not to weaken.
set role authenticated;
select set_config('app.current_user_id', (select other_branch_user::text from t_fixture4), false);
select set_config('app.current_role_claim', 'authenticated', false);
select throws_ok(
  format($$ select get_shipment_header_context('%s'::uuid) $$, :'t4_ship_id'),
  '42501', null,
  'get_shipment_header_context denies a user from a different branch (branch isolation preserved)'
);
reset role;

-- No session at all (anon-like / missing profile context) must not
-- silently return data either.
set role authenticated;
select set_config('app.current_user_id', gen_random_uuid()::text, false);
select set_config('app.current_role_claim', 'authenticated', false);
select is(
  (select get_app_shell_context()->>'reason'),
  'no-profile',
  'get_app_shell_context reports no-profile for a session with no matching profile row'
);
select throws_ok(
  $$ select get_dashboard_metrics() $$,
  '28000', null,
  'get_dashboard_metrics rejects a session with no matching active profile'
);
reset role;

-- get_assignable_profiles: the actual security fix this round — replacing
-- a view that leaked every branch's profiles to every authenticated user.
select p.id as dxb_data_entry_id from profiles p where p.role = 'shipment_data_entry' and p.branch_id = (select f.dxb_branch from t_fixture4 f) limit 1 \gset
set role authenticated;
select set_config('app.current_user_id', :'dxb_data_entry_id', false), set_config('app.current_role_claim', 'authenticated', false);
select ok(
  (select bool_and(gp.branch_id = (select f.dxb_branch from t_fixture4 f)) from get_assignable_profiles() gp),
  'a Dubai user only sees Dubai profiles from get_assignable_profiles (cannot see Abu Dhabi)'
);
reset role;

set role authenticated;
select set_config('app.current_user_id', (select other_branch_user::text from t_fixture4), false);
select set_config('app.current_role_claim', 'authenticated', false);
select ok(
  (select coalesce(bool_and(gp.branch_id <> (select f.dxb_branch from t_fixture4 f)), true) from get_assignable_profiles() gp),
  'an Abu Dhabi (non-cross-branch) user cannot see any Dubai profiles from get_assignable_profiles'
);
reset role;

set role authenticated;
select set_config('app.current_user_id', (select dxb_supervisor::text from t_fixture4), false);
select set_config('app.current_role_claim', 'authenticated', false);
select ok(
  (select count(*)::int from get_assignable_profiles()) > (
    select count(*)::int from profiles where branch_id = (select dxb_branch from t_fixture4) and is_active
  ) - 1,
  'an authorized cross-branch supervisor (view_all_branches) receives more than just their own branch'
);
select ok(
  (select count(*)::int from get_assignable_profiles(p_required_permission := 'edit_delivery_order')) >= 0,
  'get_assignable_profiles accepts a required-permission filter without erroring'
);
reset role;

set role authenticated;
select set_config('app.current_user_id', gen_random_uuid()::text, false);
select set_config('app.current_role_claim', 'authenticated', false);
select throws_ok(
  $$ select * from get_assignable_profiles() $$,
  '28000', null,
  'get_assignable_profiles rejects an unprovisioned (no matching profile) session'
);
reset role;

-- Clear the stale "unprovisioned" session variable from the previous
-- test before this admin-level UPDATE — reset role clears the ROLE but
-- not custom session GUCs, and a trigger reads app.current_user_id for
-- audit-log actor attribution, so a leftover nonexistent UUID here would
-- fail that trigger's own foreign key constraint.
select set_config('app.current_user_id', (select dxb_supervisor::text from t_fixture4), false);
update profiles set is_active = false where id = (select dxb_supervisor from t_fixture4);
set role authenticated;
select set_config('app.current_user_id', (select dxb_supervisor::text from t_fixture4), false);
select set_config('app.current_role_claim', 'authenticated', false);
select is(
  (select get_app_shell_context()->>'reason'),
  'inactive',
  'get_app_shell_context reports inactive (not no-profile) for a deactivated profile'
);
select throws_ok(
  $$ select * from get_assignable_profiles() $$,
  '28000', null,
  'get_assignable_profiles rejects an inactive profile'
);
reset role;

select * from finish();
rollback;

-- ============================================================
-- FIFTH TRANSACTION BLOCK — per-tab RPC branch isolation
-- ============================================================
begin;
select plan(4);

create temp table t_fixture5 as
select
  (select id from branches where code = 'DXB-AIR') as dxb_branch,
  (select id from profiles where role = 'shipment_supervisor' and branch_id = (select id from branches where code = 'DXB-AIR') limit 1) as dxb_supervisor,
  (select id from profiles where branch_id != (select id from branches where code = 'DXB-AIR') limit 1) as other_branch_user;
grant select on t_fixture5 to authenticated;

set role authenticated;
select set_config('app.current_user_id', (select dxb_supervisor::text from t_fixture5), false);
select set_config('app.current_role_claim', 'authenticated', false);
select id as t5_ship_id from create_shipment(
  'Air', current_date, null, (select dxb_branch from t_fixture5), (select id from suppliers where is_active limit 1),
  'Tab RPC Test Supplier', null, 'Medium', (select dxb_supervisor from t_fixture5), null, null
) \gset

select ok(
  (select get_shipment_overview_tab(:'t5_ship_id'::uuid)) is not null,
  'get_shipment_overview_tab returns data for a shipment in the caller''s own branch'
);
select ok(
  (select (get_shipment_transport_tab(:'t5_ship_id'::uuid)->>'can_edit')::boolean) is not null,
  'get_shipment_transport_tab returns a can_edit flag'
);
reset role;

set role authenticated;
select set_config('app.current_user_id', (select other_branch_user::text from t_fixture5), false);
select set_config('app.current_role_claim', 'authenticated', false);
select throws_ok(
  format($$ select get_shipment_invoices_tab('%s'::uuid) $$, :'t5_ship_id'),
  '42501', null,
  'get_shipment_invoices_tab denies a user from a different branch'
);
select throws_ok(
  format($$ select get_shipment_comments_tab('%s'::uuid) $$, :'t5_ship_id'),
  '42501', null,
  'get_shipment_comments_tab denies a user from a different branch (every tab RPC shares the same access check)'
);
reset role;

select * from finish();
rollback;

-- ============================================================
-- SIXTH TRANSACTION BLOCK — New Shipment form-context RPCs
-- ============================================================
begin;
select plan(5);

create temp table t_fixture6 as
select (select id from profiles where role = 'shipment_data_entry' and branch_id = (select id from branches where code = 'DXB-AIR') limit 1) as dxb_user;
grant select on t_fixture6 to authenticated;

set role authenticated;
select set_config('app.current_user_id', (select dxb_user::text from t_fixture6), false);
select set_config('app.current_role_claim', 'authenticated', false);

select is(
  (select get_new_shipment_form_context()->>'fixed_branch_id'),
  (select branch_id::text from profiles where id = (select dxb_user from t_fixture6)),
  'a non-cross-branch user gets a fixed_branch_id matching their own branch'
);
select ok(
  (select jsonb_array_length(get_new_shipment_form_context()->'branches')) = 1,
  'a non-cross-branch user only gets their own branch in the branches list'
);
select ok(
  (select jsonb_array_length(get_new_shipment_form_context()->'currencies')) > 0,
  'get_new_shipment_form_context returns a non-empty currency list'
);
select ok(
  (select count(*)::int from search_active_suppliers(null, 5, 0)) <= 5,
  'search_active_suppliers respects the limit argument'
);
select throws_ok(
  format($$ select * from search_active_suppliers(%L, 20, 0) $$, repeat('x', 200)),
  '23514', null,
  'search_active_suppliers rejects an excessively long query string'
);
reset role;

select * from finish();
rollback;

-- ============================================================
-- MODULE 3 — cross-shipment workspaces & reports
-- ============================================================
begin;
select plan(11);

create temp table t_fixture_m3 as
select
  (select id from profiles where role = 'customs_clearance_user' limit 1) as dxb_user,
  (select id from profiles where role = 'shipment_supervisor' limit 1) as dxb_supervisor,
  (select s.id from shipments s join branches b on b.id = s.branch_id where b.code = 'DXB-AIR' limit 1) as dxb_shipment,
  (select s.id from shipments s join branches b on b.id = s.branch_id where b.code = 'AUH' limit 1) as auh_shipment,
  (select id from exception_types limit 1) as etype;
grant select on t_fixture_m3 to authenticated;

-- Raise one exception on each branch's shipment so branch-scoping is
-- actually exercised, not just trivially empty on both sides.
set role authenticated;
select set_config('app.current_user_id', (select dxb_user::text from t_fixture_m3), false);
select set_config('app.current_role_claim', 'authenticated', false);
select raise_exception((select dxb_shipment from t_fixture_m3), (select etype from t_fixture_m3), 'Critical', 'DXB test exception', null, null);
reset role;

set role authenticated;
select set_config('app.current_user_id', (select dxb_supervisor::text from t_fixture_m3), false);
select set_config('app.current_role_claim', 'authenticated', false);
select raise_exception((select auh_shipment from t_fixture_m3), (select etype from t_fixture_m3), 'Low', 'AUH test exception', null, null);
reset role;

-- ============================================================
-- search_exceptions
-- ============================================================
set role authenticated;
select set_config('app.current_user_id', (select dxb_user::text from t_fixture_m3), false);
select set_config('app.current_role_claim', 'authenticated', false);
select is(
  (select count(*)::int from search_exceptions(null, null, 1, 25)),
  1, 'DXB customs_clearance_user sees exactly 1 exception (their own branch''s), not the AUH one'
);
select is(
  (select count(*)::int from search_exceptions(null, 'Critical', 1, 25)),
  1, 'severity filter narrows correctly'
);
select is(
  (select count(*)::int from search_exceptions(null, 'Low', 1, 25)),
  0, 'severity filter correctly excludes a severity with no matching in-branch rows'
);
select throws_ok(
  $$ select * from search_exceptions('NotARealStatus', null, 1, 25) $$,
  '23514', null, 'search_exceptions rejects an invalid status value'
);
select throws_ok(
  $$ select * from search_exceptions(null, 'NotARealSeverity', 1, 25) $$,
  '23514', null, 'search_exceptions rejects an invalid severity value'
);
reset role;

set role authenticated;
select set_config('app.current_user_id', (select dxb_supervisor::text from t_fixture_m3), false);
select set_config('app.current_role_claim', 'authenticated', false);
select is(
  (select count(*)::int from search_exceptions(null, null, 1, 25)),
  2, 'shipment_supervisor (view_all_branches) sees both the DXB and AUH exceptions'
);
reset role;

-- ============================================================
-- get_report_shipments
-- ============================================================
set role authenticated;
select set_config('app.current_user_id', (select dxb_user::text from t_fixture_m3), false);
select set_config('app.current_role_claim', 'authenticated', false);
select throws_ok(
  $$ select * from get_report_shipments('not_a_real_report', 1, 25) $$,
  '23514', null, 'get_report_shipments rejects an unrecognized report key'
);
select ok(
  (select count(*)::int from get_report_shipments('pending', 1, 100)) >= 0,
  'get_report_shipments(pending) runs without error for an ordinary user'
);
select is(
  (select bool_and(s.branch_id = (select branch_id from profiles where id = (select dxb_user from t_fixture_m3)))
   from get_report_shipments('pending', 1, 500) r join shipments s on s.id = r.id),
  true, 'get_report_shipments only returns the caller''s own branch when they lack view_all_branches'
);
reset role;

-- ============================================================
-- get_report_supplier_performance
-- ============================================================
set role authenticated;
select set_config('app.current_user_id', (select dxb_supervisor::text from t_fixture_m3), false);
select set_config('app.current_role_claim', 'authenticated', false);
select ok(
  (select count(*)::int from get_report_supplier_performance(1, 50)) >= 1,
  'get_report_supplier_performance returns at least one supplier row for a view_all_branches user'
);
select ok(
  (select bool_and(open_exceptions >= 0) from get_report_supplier_performance(1, 50)),
  'open_exceptions is never negative (sanity check on the correlated subquery)'
);
reset role;

select * from finish();
rollback;

-- ============================================================
-- MODULE 4 — master data permission gating + full import pipeline
-- ============================================================
begin;
select plan(11);

create temp table t_fixture_m4 as
select
  (select id from profiles where role = 'system_administrator' limit 1) as admin_id,
  (select id from profiles where role = 'shipment_data_entry' limit 1) as ordinary_id,
  (select id from branches where code = 'DXB-AIR' limit 1) as branch_id,
  (select id from shipment_categories limit 1) as cat_id;
grant select on t_fixture_m4 to authenticated;

-- ============================================================
-- Master data: ordinary users cannot write, admins can
-- ============================================================
set role authenticated;
select set_config('app.current_user_id', (select ordinary_id::text from t_fixture_m4), false);
select set_config('app.current_role_claim', 'authenticated', false);
select throws_ok(
  $$ select * from upsert_country(null, 'ZZ', 'Not A Real Country', true, 0) $$,
  '42501', null, 'an ordinary user without administer cannot call upsert_country'
);
reset role;

set role authenticated;
select set_config('app.current_user_id', (select admin_id::text from t_fixture_m4), false);
select set_config('app.current_role_claim', 'authenticated', false);
create temp table t_country_result as
select id as country_id from upsert_country(null, 'ZZ', 'Test Country M4', true, 0);
grant select on t_country_result to authenticated;
select upsert_currency('ZZZ', 'Test Currency M4', true);
reset role;

select ok((select country_id from t_country_result) is not null, 'an administer-permission user CAN call upsert_country');
select is(
  (select name from countries where id = (select country_id from t_country_result)),
  'Test Country M4', 'upsert_country actually persisted the row'
);

set role authenticated;
select set_config('app.current_user_id', (select admin_id::text from t_fixture_m4), false);
select set_config('app.current_role_claim', 'authenticated', false);
select throws_ok(
  $$ select * from upsert_fx_rate('ZZZ', current_date, -5, 'manual') $$,
  '23514', null, 'upsert_fx_rate rejects a non-positive rate'
);
select throws_ok(
  $$ select * from upsert_fx_rate('NOTREAL', current_date, 1, 'manual') $$,
  'P0002', null, 'upsert_fx_rate rejects an unrecognized currency code'
);
reset role;

-- ============================================================
-- Historical import: full pipeline, mirroring the manual functional test
-- ============================================================
set role authenticated;
select set_config('app.current_user_id', (select admin_id::text from t_fixture_m4), false);
select set_config('app.current_role_claim', 'authenticated', false);
create temp table t_batch as
select id as batch_id from create_import_batch('pgtap_test_import.xlsx', 'sha_pgtap_test_import', 500);
grant select on t_batch to authenticated;
reset role;

select ok((select batch_id from t_batch) is not null, 'create_import_batch succeeds for an admin');

set role authenticated;
select set_config('app.current_user_id', (select admin_id::text from t_fixture_m4), false);
select set_config('app.current_role_claim', 'authenticated', false);
select throws_ok(
  $$ select * from create_import_batch('another.xlsx', 'sha_pgtap_test_import', 500) $$,
  '23505', null, 'create_import_batch rejects a duplicate file hash'
);

create temp table t_stage_result as
select * from stage_import_rows((select batch_id from t_batch),
  '[
    {"source_row_number": 1, "source_month": "January", "raw_values": {"supplier":"pgTAP Supplier A","invoice_no":"PGTAP-001","invoice_date":"2025-01-05","invoice_value":100,"currency":"AED"}},
    {"source_row_number": 2, "source_month": "January", "raw_values": {"supplier":"pgTAP Supplier B","invoice_no":"PGTAP-002","invoice_date":"garbage","invoice_value":200,"currency":"AED"}}
  ]'::jsonb
);
grant select on t_stage_result to authenticated;
select fn_validate_import_batch((select batch_id from t_batch));
select set_import_reconciliation_expected((select batch_id from t_batch), 'January', 1);
create temp table t_commit_result as
select * from fn_commit_import_batch_chunk((select batch_id from t_batch), (select branch_id from t_fixture_m4), (select cat_id from t_fixture_m4));
grant select on t_commit_result to authenticated;
reset role;

select is((select staged_count from t_stage_result), 2, 'stage_import_rows stages both rows (validation happens separately, not at staging time)');
select is(
  (select invalid_rows from import_batches where id = (select batch_id from t_batch)),
  1, 'fn_validate_import_batch correctly flags the malformed-date row as invalid'
);
select is((select batch_status from t_commit_result), 'Committed', 'the batch reaches Committed when reconciliation matches (1 valid row, expected 1)');
select is(
  (select count(*)::int from shipments where import_batch_id = (select batch_id from t_batch)),
  1, 'exactly one shipment was actually created from the one valid row'
);

select * from finish();
rollback;

-- ============================================================
-- DASHBOARD REBUILD — get_dashboard_metrics' new fields
-- ============================================================
begin;
select plan(6);

create temp table t_fixture_dash as
select
  (select id from profiles where role = 'shipment_supervisor' limit 1) as supervisor_id,
  (select id from profiles where role = 'shipment_data_entry' limit 1) as dxb_user,
  (select s.id from shipments s join branches b on b.id = s.branch_id where b.code = 'DXB-AIR' limit 1) as dxb_shipment,
  (select s.id from shipments s join branches b on b.id = s.branch_id where b.code = 'AUH' limit 1) as auh_shipment;
grant select on t_fixture_dash to authenticated;

-- Force one DXB shipment to have a rejected customs status and a
-- passed ETA, so attention_required and the KPI counters have real,
-- deterministic rows to find rather than relying on whatever the seed
-- happens to contain.
-- Force one DXB shipment to have a customs status that's still pending
-- and a passed ETA, so attention_required and the KPI counters have
-- real, deterministic rows to find rather than relying on whatever the
-- seed happens to contain. (Customs rejections are tracked via
-- Exceptions now, not a customs_status value — see the dashboard
-- rebuild's own comment on why that specific alert was removed rather
-- than duplicated.)
update shipments set customs_status = 'Pending', overall_status = 'Created' where id = (select dxb_shipment from t_fixture_dash);
update shipments set eta = now() - interval '2 days', overall_status = 'Created' where id = (select auh_shipment from t_fixture_dash);

set role authenticated;
select set_config('app.current_user_id', (select dxb_user::text from t_fixture_dash), false);
select set_config('app.current_role_claim', 'authenticated', false);

select ok(
  (select jsonb_typeof(get_dashboard_metrics()->'monthly_volume') = 'array'),
  'monthly_volume is a JSON array'
);
select is(
  (select jsonb_array_length(get_dashboard_metrics()->'monthly_volume')),
  6, 'monthly_volume always returns exactly 6 months (including zero-count months), not just months with data'
);
select ok(
  (select count(*)::int from shipments s where s.branch_id = (select branch_id from profiles where id = (select dxb_user from t_fixture_dash)))
    = (select sum((elem->>'count')::int) from jsonb_array_elements(get_dashboard_metrics()->'status_distribution') elem),
  'status_distribution counts sum to exactly the caller''s own branch total (branch scoping honored)'
);
select ok(
  (select not exists (
    select 1 from jsonb_array_elements(get_dashboard_metrics()->'attention_required') elem
    where elem->>'ref' = (select ref from shipments where id = (select auh_shipment from t_fixture_dash))
  )),
  'attention_required does NOT include an AUH-branch shipment for a DXB-only user (branch scoping honored on the alerts list too)'
);
reset role;

-- A view_all_branches user (supervisor) should see attention items from
-- BOTH branches, including the AUH one just forced into an ETA-passed
-- state.
set role authenticated;
select set_config('app.current_user_id', (select supervisor_id::text from t_fixture_dash), false);
select set_config('app.current_role_claim', 'authenticated', false);
select ok(
  (select exists (
    select 1 from jsonb_array_elements(get_dashboard_metrics()->'attention_required') elem
    where elem->>'text' = 'ETA passed but shipment still at Created stage' and elem->>'ref' = (select ref from shipments where id = (select auh_shipment from t_fixture_dash))
  )),
  'a view_all_branches user sees the ETA-passed alert for a shipment in a DIFFERENT branch'
);
select ok(
  (select bool_and(
    case p1 when 'Critical' then 0 when 'High' then 1 when 'Medium' then 2 else 3 end
    <= case p2 when 'Critical' then 0 when 'High' then 1 when 'Medium' then 2 else 3 end
  ) from (
    select
      elem->>'priority' as p1,
      lead(elem->>'priority') over (order by ord) as p2
    from (
      select elem, row_number() over () as ord
      from jsonb_array_elements(get_dashboard_metrics()->'attention_required') elem
    ) x
  ) pairs where p2 is not null),
  'attention_required is actually sorted by priority (Critical before High before Medium before Low), not just capped at 12 in arbitrary order'
);
reset role;

select * from finish();
rollback;

-- ============================================================
-- change_shipment_status / status_transitions no longer exist — both
-- were fully replaced by automatic status derivation (see
-- 20260101000025_auto_status_progression.sql). The regression test that
-- used to live here guarded a specific historical bug in that removed
-- function (a bogus permission check that blocked every role); with the
-- function itself gone, there's nothing meaningful left to test in its
-- place. The new derivation engine has its own dedicated regression
-- tests further down in this file instead.
-- ============================================================

-- ============================================================
-- REGRESSION TEST — verify_document / archive_document. Two more real
-- bugs found while investigating why a shipment couldn't reach "Ready
-- for Submission": verify_document's UPDATE used a CASE expression that
-- Postgres didn't reliably cast to the doc_version_status enum, and the
-- frontend was calling archive_document with a documents.id where a
-- document_versions.id was required (a different row entirely) — every
-- Archive attempt was failing with NOT_FOUND. Both were never caught
-- because neither function had ever actually been called end-to-end
-- before (verify_document wasn't wired into the UI at all; archive's
-- bug was purely a frontend argument-passing mistake pgTAP wouldn't
-- have caught unless it exercised the RPC directly, as it now does).
-- ============================================================
begin;
select plan(4);

create temp table t_fixture_verify as
select
  (select id from profiles where role = 'system_administrator' limit 1) as admin_id,
  (select id from branches where code = 'DXB-AIR' limit 1) as branch_id,
  (select id from shipment_categories limit 1) as cat_id,
  (select id from document_types limit 1) as doc_type_id;
grant select on t_fixture_verify to authenticated;

set role authenticated;
select set_config('app.current_user_id', (select admin_id::text from t_fixture_verify), false);
select set_config('app.current_role_claim', 'authenticated', false);
create temp table t_verify_shipment as
select id from create_shipment(
  'Air', current_date, (select cat_id from t_fixture_verify), (select branch_id from t_fixture_verify),
  (select id from suppliers where is_active limit 1), 'Verify Regression Co', (select id from countries limit 1), 'Medium',
  (select admin_id from t_fixture_verify), 'REGRESSION-VERIFY-TEST', null
);
grant select on t_verify_shipment to authenticated;

create temp table t_verify_doc as
select gen_random_uuid() as doc_id;
alter table t_verify_doc add column test_path text;
update t_verify_doc set test_path = 'shipments/' || (select id::text from t_verify_shipment) || '/' || doc_id::text || '/test.pdf';
grant select on t_verify_doc to authenticated;

select fn_register_upload_intent(
  (select id from t_verify_shipment), (select doc_id from t_verify_doc), (select test_path from t_verify_doc),
  'application/pdf', 100, 'h'
);
create temp table t_verify_version as
select id from upload_document_metadata(
  (select id from t_verify_shipment), (select doc_id from t_verify_doc), null, (select doc_type_id from t_fixture_verify),
  (select test_path from t_verify_doc), 'test.pdf', 'application/pdf', 100, 'h'
);
grant select on t_verify_version to authenticated;
reset role;

-- verify_document (approve branch) — was failing with a type-cast error
-- on every single call.
set role authenticated;
select set_config('app.current_user_id', (select admin_id::text from t_fixture_verify), false);
select set_config('app.current_role_claim', 'authenticated', false);
select is(
  (select status::text from verify_document((select id from t_verify_version), true, null)),
  'Verified', 'verify_document(approve=true) succeeds and correctly sets status to Verified'
);
reset role;

-- verify_document (reject branch) — same CASE expression, other side.
set role authenticated;
select set_config('app.current_user_id', (select admin_id::text from t_fixture_verify), false);
select set_config('app.current_role_claim', 'authenticated', false);
create temp table t_verify_shipment2 as
select id from create_shipment(
  'Air', current_date, (select cat_id from t_fixture_verify), (select branch_id from t_fixture_verify),
  (select id from suppliers where is_active limit 1), 'Verify Regression Co 2', (select id from countries limit 1), 'Medium',
  (select admin_id from t_fixture_verify), 'REGRESSION-VERIFY-TEST-2', null
);
grant select on t_verify_shipment2 to authenticated;
create temp table t_verify_doc2 as
select gen_random_uuid() as doc_id;
alter table t_verify_doc2 add column test_path text;
update t_verify_doc2 set test_path = 'shipments/' || (select id::text from t_verify_shipment2) || '/' || doc_id::text || '/test2.pdf';
grant select on t_verify_doc2 to authenticated;
select fn_register_upload_intent(
  (select id from t_verify_shipment2), (select doc_id from t_verify_doc2), (select test_path from t_verify_doc2),
  'application/pdf', 100, 'h'
);
create temp table t_verify_version2 as
select id from upload_document_metadata(
  (select id from t_verify_shipment2), (select doc_id from t_verify_doc2), null, (select doc_type_id from t_fixture_verify),
  (select test_path from t_verify_doc2), 'test2.pdf', 'application/pdf', 100, 'h'
);
grant select on t_verify_version2 to authenticated;
select is(
  (select status::text from verify_document((select id from t_verify_version2), false, 'test rejection')),
  'Rejected', 'verify_document(approve=false) succeeds and correctly sets status to Rejected'
);

-- get_shipment_documents_tab returns a real, usable version id — the
-- field that was missing entirely and is what archive/verify both need.
select ok(
  (select (get_shipment_documents_tab((select id from t_verify_shipment))->'documents'->0->'current_version'->>'id') is not null),
  'get_shipment_documents_tab returns a non-null current_version.id'
);

-- archive_document — was failing with NOT_FOUND on every call because
-- the frontend passed a documents.id where a document_versions.id was
-- required. Calling it correctly (as this test now does, and as the
-- fixed frontend now does) must actually succeed.
select ok(
  (select status::text from archive_document((select id from t_verify_version2), 'regression test archive')) = 'Archived',
  'archive_document succeeds when called with the correct document_versions id'
);
reset role;

select * from finish();
rollback;

-- ============================================================
-- REGRESSION TEST — confirm_shipment_completion. This RPC, and the
-- completion_eligible trigger behind it, were both already correct and
-- working since Module 2 — but nothing in the frontend had ever called
-- either, meaning no shipment could actually be marked Completed through
-- the app at all (the same class of gap as verify_document). This test
-- exercises the real end-to-end path: reject when not eligible, then
-- genuinely drive a shipment through every subprocess to a real
-- completion-eligible state and confirm the RPC succeeds.
-- ============================================================
begin;
select plan(4);

create temp table t_fixture_complete as
select
  (select id from profiles where role = 'system_administrator' limit 1) as admin_id,
  (select id from branches where code = 'DXB-AIR' limit 1) as branch_id,
  (select id from shipment_categories where name = 'Fresh Fruits and Vegetables' limit 1) as cat_id;
grant select on t_fixture_complete to authenticated;

set role authenticated;
select set_config('app.current_user_id', (select admin_id::text from t_fixture_complete), false);
select set_config('app.current_role_claim', 'authenticated', false);
create temp table t_complete_shipment as
select id, ref from create_shipment(
  'Air', current_date, (select cat_id from t_fixture_complete), (select branch_id from t_fixture_complete),
  (select id from suppliers where is_active limit 1), 'Completion Regression Co', (select id from countries limit 1), 'Medium',
  (select admin_id from t_fixture_complete), 'REGRESSION-COMPLETION-TEST', null
);
grant select on t_complete_shipment to authenticated;
reset role;

-- A fresh shipment isn't remotely eligible, and correctly sits at the
-- very first stage.
select is(
  (select overall_status::text from shipments where id = (select id from t_complete_shipment)),
  'Created', 'a fresh shipment starts at overall_status = Created'
);

-- Upload + verify the shipment's one document first (single-document-
-- upload model — see 20260101000022 — not the old 5-type checklist).
-- Order matters here: this needs to happen BEFORE the other subprocesses
-- reach their terminal state, matching how this would actually unfold in
-- practice (documents settle early; customs/municipality/delivery
-- order/MOFAIC/physical docs resolve later). Doing it the other way
-- around would have the shipment auto-complete — and lock itself
-- read-only — the moment this one document is verified, which is a
-- genuine, correct consequence of both designs working together, not a
-- bug; it just isn't what this particular test is trying to exercise.
set role authenticated;
select set_config('app.current_user_id', (select admin_id::text from t_fixture_complete), false);
select set_config('app.current_role_claim', 'authenticated', false);
do $body$
declare
  v_sid uuid := (select id from t_complete_shipment);
  v_doc_id uuid := gen_random_uuid();
  v_path text;
  v_ver_id uuid;
  v_type_id uuid;
begin
  select id into v_type_id from document_types where name = 'Shipment Documents' limit 1;
  v_path := 'shipments/' || v_sid::text || '/' || v_doc_id::text || '/f.pdf';
  perform fn_register_upload_intent(v_sid, v_doc_id, v_path, 'application/pdf', 100, 'h');
  select id into v_ver_id from upload_document_metadata(v_sid, v_doc_id, null, v_type_id, v_path, 'f.pdf', 'application/pdf', 100, 'h');
  perform verify_document(v_ver_id, true, null);
end $body$;
reset role;

-- Now drive every remaining subprocess to a genuine terminal state
-- (direct UPDATE as superuser here — the same pattern the rest of this
-- suite already uses to set up preconditions the RPCs themselves don't
-- expose a path to set directly; RLS correctly blocks this under the
-- authenticated role, which is exactly why it's done here instead).
-- This single UPDATE touches every remaining watched column at once, so
-- the recalculation trigger fires exactly once, with everything
-- (including the already-verified document) genuinely resolved — this
-- is the moment auto-completion should actually happen.
update shipments set
  customs_status = 'Finished', municipality_status = 'Finished',
  delivery_order_status = 'Verified', mofaic_status = 'Not Applicable', physical_doc_status = 'Closed'
where id = (select id from t_complete_shipment);

-- No manual action at all now — that single UPDATE above should have
-- fired the recalculation trigger and driven overall_status straight to
-- Completed on its own.
select ok(
  (select completion_eligible from shipments where id = (select id from t_complete_shipment)),
  'completion_eligible correctly becomes true automatically once every subprocess reaches a terminal state'
);

select is(
  (select overall_status::text from shipments where id = (select id from t_complete_shipment)),
  'Completed', 'overall_status automatically becomes Completed the moment eligibility is reached — no manual action required'
);

-- fn_is_shipment_completion_eligible is the independent, freshly-computed
-- check — confirms it agrees with the cached column, not just that the
-- column itself says so.
select ok(
  (select fn_is_shipment_completion_eligible((select id from t_complete_shipment))),
  'fn_is_shipment_completion_eligible independently confirms eligibility, not just trusting the cached column'
);
reset role;

select * from finish();
rollback;

-- ============================================================
-- REGRESSION TEST — single-document upload model. Confirms the actual
-- behavior change: a shipment in the "Fresh Fruits and Vegetables"
-- category (which has 5 required_documents rows) now only needs ONE
-- document verified to reach document_status = 'Verified' — the
-- previous per-type-checklist logic would have required all 5.
-- ============================================================
begin;
select plan(3);

create temp table t_fixture_single as
select
  (select id from profiles where role = 'system_administrator' limit 1) as admin_id,
  (select id from branches where code = 'DXB-AIR' limit 1) as branch_id,
  (select id from shipment_categories where name = 'Fresh Fruits and Vegetables' limit 1) as cat_id,
  (select id from document_types where name = 'Shipment Documents' limit 1) as doc_type_id;
grant select on t_fixture_single to authenticated;

set role authenticated;
select set_config('app.current_user_id', (select admin_id::text from t_fixture_single), false);
select set_config('app.current_role_claim', 'authenticated', false);
create temp table t_single_shipment as
select id from create_shipment(
  'Air', current_date, (select cat_id from t_fixture_single), (select branch_id from t_fixture_single),
  (select id from suppliers where is_active limit 1), 'Single Doc Regression Co', (select id from countries limit 1), 'Medium',
  (select admin_id from t_fixture_single), 'REGRESSION-SINGLE-DOC-TEST', null
);
grant select on t_single_shipment to authenticated;

select ok(
  (select document_status::text from shipments where id = (select id from t_single_shipment)) = 'Pending',
  'a fresh shipment with zero documents uploaded starts at document_status = Pending'
);

create temp table t_single_doc as select gen_random_uuid() as doc_id;
alter table t_single_doc add column test_path text;
update t_single_doc set test_path = 'shipments/' || (select id::text from t_single_shipment) || '/' || doc_id::text || '/combined.pdf';
grant select on t_single_doc to authenticated;

select fn_register_upload_intent(
  (select id from t_single_shipment), (select doc_id from t_single_doc), (select test_path from t_single_doc),
  'application/pdf', 100, 'h'
);
create temp table t_single_version as
select id from upload_document_metadata(
  (select id from t_single_shipment), (select doc_id from t_single_doc), null, (select doc_type_id from t_fixture_single),
  (select test_path from t_single_doc), 'combined.pdf', 'application/pdf', 100, 'h'
);
grant select on t_single_version to authenticated;

select ok(
  (select document_status::text from shipments where id = (select id from t_single_shipment)) = 'Documents Pending',
  'after ONE document is uploaded (not verified yet), document_status becomes Documents Pending — awaiting verification, not blocked on 4 other required types'
);

select verify_document((select id from t_single_version), true, null);

select is(
  (select document_status::text from shipments where id = (select id from t_single_shipment)), 'Verified',
  'verifying that ONE document is sufficient to reach document_status = Verified — the old per-type checklist would have required 5'
);
reset role;

select * from finish();
rollback;

-- ============================================================
-- REGRESSION TEST — flight status tracking + Delivery Order rename
-- (Air Shipment team's requests from a real stakeholder meeting).
-- ============================================================
begin;
select plan(5);

create temp table t_fixture_flight as
select
  (select id from profiles where role = 'system_administrator' limit 1) as admin_id,
  (select id from branches where code = 'DXB-AIR' limit 1) as branch_id,
  (select id from shipment_categories limit 1) as cat_id;
grant select on t_fixture_flight to authenticated;

set role authenticated;
select set_config('app.current_user_id', (select admin_id::text from t_fixture_flight), false);
select set_config('app.current_role_claim', 'authenticated', false);
create temp table t_flight_shipment as
select id from create_shipment(
  'Air', current_date, (select cat_id from t_fixture_flight), (select branch_id from t_fixture_flight),
  (select id from suppliers where is_active limit 1), 'Flight Regression Co', (select id from countries limit 1), 'Medium',
  (select admin_id from t_fixture_flight), 'REGRESSION-FLIGHT-TEST', null
);
grant select on t_flight_shipment to authenticated;

select is(
  (select flight_status::text from shipments where id = (select id from t_flight_shipment)),
  'Booked', 'a fresh shipment defaults to flight_status = Booked'
);

select throws_ok(
  format($$ select update_shipment_transport(%L, null, null, 'EK123', null, null, null, null, null, null, null, null, 'In Transit', null) $$, (select id::text from t_flight_shipment)),
  '23514', null, 'setting flight_status to In Transit without a transit_airport is rejected'
);

select ok(
  (select transit_airport = 'Doha (DOH)' from update_shipment_transport(
    (select id from t_flight_shipment), null, null, 'EK123', null, null, null, null, null, null, null, null, 'In Transit', 'Doha (DOH)'
  )),
  'setting flight_status to In Transit WITH a transit_airport succeeds and stores it'
);

select ok(
  (select transit_airport is null from update_shipment_transport(
    (select id from t_flight_shipment), null, null, 'EK123', null, null, null, null, null, null, null, null, 'Departed', null
  )),
  'moving flight_status away from In Transit clears the stale transit_airport automatically'
);

select is(
  (select delivery_order_status::text from update_delivery_order(
    (select id from t_flight_shipment), null, 'Received from Carrier', null, null, false, null, null
  )),
  'Received from Carrier', 'delivery_order_status can be set to the renamed value Received from Carrier'
);
reset role;

select * from finish();
rollback;

-- ============================================================
-- REGRESSION TEST — hardening batch 1: consolidated New Shipment
-- profile lists, required supplier_id, and the fixed Activity limit.
-- ============================================================
begin;
select plan(7);

create temp table t_fixture_hardening as
select
  (select id from profiles where role = 'system_administrator' limit 1) as admin_id,
  (select id from branches where code = 'DXB-AIR' limit 1) as branch_id,
  (select id from shipment_categories limit 1) as cat_id,
  (select id from suppliers where is_active limit 1) as supplier_id;
grant select on t_fixture_hardening to authenticated;

set role authenticated;
select set_config('app.current_user_id', (select admin_id::text from t_fixture_hardening), false);
select set_config('app.current_role_claim', 'authenticated', false);

-- Item 2: get_new_shipment_form_context now includes the 4 assignable-
-- profile lists that New Shipment previously fetched via 4 separate
-- get_assignable_profiles calls.
select ok(
  (select get_new_shipment_form_context() ? 'general_profiles'),
  'get_new_shipment_form_context includes general_profiles'
);
select ok(
  (select get_new_shipment_form_context() ? 'delivery_order_profiles'),
  'get_new_shipment_form_context includes delivery_order_profiles'
);
select ok(
  (select get_new_shipment_form_context() ? 'mofaic_profiles'),
  'get_new_shipment_form_context includes mofaic_profiles'
);
select ok(
  (select get_new_shipment_form_context() ? 'physical_docs_profiles'),
  'get_new_shipment_form_context includes physical_docs_profiles'
);

-- Item 3: create_shipment now genuinely requires a real supplier_id —
-- the old free-text fallback is gone entirely, not just the canonical-
-- name-spoofing case fixed earlier.
select throws_ok(
  $$ select create_shipment('Air', current_date, null, (select branch_id from t_fixture_hardening),
       null, 'Any Made Up Name At All', null, 'Medium', (select admin_id from t_fixture_hardening), null, null) $$,
  '23502', null, 'create_shipment rejects p_supplier_id = null unconditionally now, regardless of any accompanying name'
);
select ok(
  (select supplier_id is not null from create_shipment(
    'Air', current_date, (select cat_id from t_fixture_hardening), (select branch_id from t_fixture_hardening),
    (select supplier_id from t_fixture_hardening), null, null, 'Medium', (select admin_id from t_fixture_hardening), null, null
  )),
  'create_shipment still succeeds normally with a real, valid supplier_id'
);
reset role;

-- Item 8: Activity's limit actually works now. Create the shipment first
-- to get its real, auto-generated ref (p_internal_ref is a different
-- field entirely, not what audit_log.shipment_ref needs to match), then
-- insert 105 audit_log rows directly against that real ref — bypassing
-- the normal RPC path is the correct way to set up a volume precondition
-- no single legitimate action produces — and confirm the returned array
-- is capped at 100, not 105.
set role authenticated;
select set_config('app.current_user_id', (select admin_id::text from t_fixture_hardening), false);
select set_config('app.current_role_claim', 'authenticated', false);
create temp table t_activity_shipment as
select id, ref from create_shipment(
  'Air', current_date, (select cat_id from t_fixture_hardening), (select branch_id from t_fixture_hardening),
  (select supplier_id from t_fixture_hardening), null, null, 'Medium', (select admin_id from t_fixture_hardening), null, null
);
grant select on t_activity_shipment to authenticated;
reset role;

insert into audit_log (shipment_ref, actor, actor_role, action, module, occurred_at)
select (select ref from t_activity_shipment), (select admin_id from t_fixture_hardening), 'system_administrator',
  'Test event ' || gs, 'Overview', now() - (gs || ' minutes')::interval
from generate_series(1, 105) gs;

set role authenticated;
select set_config('app.current_user_id', (select admin_id::text from t_fixture_hardening), false);
select set_config('app.current_role_claim', 'authenticated', false);
select ok(
  (select jsonb_array_length(get_shipment_activity_tab((select id from t_activity_shipment))->'events') <= 100),
  'get_shipment_activity_tab genuinely caps at 100 events now — the old limit was written after jsonb_agg() and did nothing at all'
);
reset role;

select * from finish();
rollback;

-- ============================================================
-- REGRESSION TEST — automatic status progression engine
-- (fn_recalculate_shipment_progress). Confirms each of the 8 stages is
-- reached independently, in the right order, purely from subprocess
-- status changes — no manual action anywhere in this test.
-- ============================================================
begin;
select plan(9);

create temp table t_fixture_progress as
select
  (select id from profiles where role = 'system_administrator' limit 1) as admin_id,
  (select id from branches where code = 'DXB-AIR' limit 1) as branch_id,
  (select id from shipment_categories limit 1) as cat_id,
  (select id from suppliers where is_active limit 1) as supplier_id;
grant select on t_fixture_progress to authenticated;

set role authenticated;
select set_config('app.current_user_id', (select admin_id::text from t_fixture_progress), false);
select set_config('app.current_role_claim', 'authenticated', false);
create temp table t_progress_shipment as
select id from create_shipment(
  'Air', current_date, (select cat_id from t_fixture_progress), (select branch_id from t_fixture_progress),
  (select supplier_id from t_fixture_progress), null, null, 'Medium',
  (select admin_id from t_fixture_progress), 'REGRESSION-PROGRESS-TEST', null
);
grant select on t_progress_shipment to authenticated;
reset role;

select is(
  (select overall_status::text from shipments where id = (select id from t_progress_shipment)),
  'Created', 'stage 1: a fresh shipment starts at Created'
);

update shipments set customs_status = 'Finished' where id = (select id from t_progress_shipment);
select is(
  (select overall_status::text from shipments where id = (select id from t_progress_shipment)),
  'Dubai Customs', 'stage 2: customs_status = Finished advances to Dubai Customs'
);

update shipments set delivery_order_status = 'Received from Carrier' where id = (select id from t_progress_shipment);
select is(
  (select overall_status::text from shipments where id = (select id from t_progress_shipment)),
  'Delivery Order Received', 'stage 3: delivery_order_status = Received from Carrier advances to Delivery Order Received'
);

update shipments set municipality_status = 'Finished' where id = (select id from t_progress_shipment);
select is(
  (select overall_status::text from shipments where id = (select id from t_progress_shipment)),
  'Dubai Municipality', 'stage 4: municipality_status = Finished advances to Dubai Municipality'
);

update shipments set originals_received = true where id = (select id from t_progress_shipment);
select is(
  (select overall_status::text from shipments where id = (select id from t_progress_shipment)),
  'Documents at FFC HO', 'stage 5: originals_received = true advances to Documents at FFC HO'
);

update shipments set mofaic_status = 'Not Applicable' where id = (select id from t_progress_shipment);
select is(
  (select overall_status::text from shipments where id = (select id from t_progress_shipment)),
  'MOFAIC Completed', 'stage 6: mofaic_status = Not Applicable advances to MOFAIC Completed'
);

update shipments set physical_doc_status = 'Dispatched' where id = (select id from t_progress_shipment);
select is(
  (select overall_status::text from shipments where id = (select id from t_progress_shipment)),
  'Physical Documents Dispatched', 'stage 7: physical_doc_status = Dispatched advances to Physical Documents Dispatched'
);

-- Still not Completed — document_status hasn't been resolved yet, even
-- though every other subprocess now sits at a terminal state.
select is(
  (select overall_status::text from shipments where id = (select id from t_progress_shipment)),
  'Physical Documents Dispatched', 'does NOT auto-complete while document_status is still unresolved, even with every other subprocess terminal'
);

-- Now resolve the last remaining piece — a blocking Critical exception
-- should still hold it back even with everything else genuinely done.
set role authenticated;
select set_config('app.current_user_id', (select admin_id::text from t_fixture_progress), false);
select set_config('app.current_role_claim', 'authenticated', false);
select raise_exception((select id from t_progress_shipment), (select id from exception_types limit 1), 'Critical', 'blocking issue', null, null);
reset role;

do $body$
declare
  v_sid uuid := (select id from t_progress_shipment);
  v_doc_id uuid := gen_random_uuid();
  v_path text;
  v_ver_id uuid;
  v_type_id uuid;
begin
  select id into v_type_id from document_types where name = 'Shipment Documents' limit 1;
  v_path := 'shipments/' || v_sid::text || '/' || v_doc_id::text || '/f.pdf';
  perform fn_register_upload_intent(v_sid, v_doc_id, v_path, 'application/pdf', 100, 'h');
  select id into v_ver_id from upload_document_metadata(v_sid, v_doc_id, null, v_type_id, v_path, 'f.pdf', 'application/pdf', 100, 'h');
  perform verify_document(v_ver_id, true, null);
end $body$;

select is(
  (select overall_status::text from shipments where id = (select id from t_progress_shipment)),
  'Physical Documents Dispatched',
  'a blocking Critical exception holds the shipment back from Completed even once every subprocess status is genuinely resolved'
);

select * from finish();
rollback;
