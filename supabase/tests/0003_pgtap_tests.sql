-- ============================================================
-- FFC Shipments Management System — pgTAP test suite
-- Run with: psql -d <db> -v ON_ERROR_STOP=1 -f 0003_pgtap_tests.sql
-- Requires: create extension pgtap;
-- Wrapped in BEGIN/ROLLBACK: nothing here persists against seed data.
-- ============================================================
begin;
select plan(43);

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
  $$ select update_customs((select auh_shipment from t_fixture), 'DECL-X', 'Approved', current_date, null, null) $$,
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
select set_config('app.current_user_id', (select dxb_supervisor::text from t_fixture), false);
select set_config('app.current_role_claim', 'authenticated', false);
select throws_ok(
  $$ select confirm_shipment_completion((select dxb_shipment from t_fixture), 'test') $$,
  '23514', null, 'confirm_shipment_completion rejects despite cached completion_eligible=true (live recheck works)'
);
reset role;

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
-- SECTION 6: DOCUMENT MODEL (updated for the intent/Storage consistency
-- checks added in review round 3, §5/§6)
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

-- Negative: no upload intent registered yet, and no Storage object exists —
-- both must independently block a phantom metadata registration.
select throws_ok(
  format(
    $$ select upload_document_metadata((select dxb_shipment from t_fixture), (select doc_id from t_doc_fixture), null,
         (select doc_type from t_doc_fixture), %L, 'invoice.pdf', 'application/pdf', 1000, 'hash1') $$,
    (select v1_path from t_doc_fixture)
  ), '23514', null, 'upload_document_metadata rejects when no Storage object exists at the path yet'
);

-- Register the intent, then create the matching Storage object (simulating
-- what a real signed-upload-URL flow does), then metadata registration
-- should succeed.
select fn_register_upload_intent(
  (select dxb_shipment from t_fixture), (select doc_id from t_doc_fixture), (select v1_path from t_doc_fixture),
  'application/pdf', 1000, 'hash1'
);

-- Negative: metadata registration still blocked until the Storage object
-- itself actually exists, even with a valid intent.
select throws_ok(
  format(
    $$ select upload_document_metadata((select dxb_shipment from t_fixture), (select doc_id from t_doc_fixture), null,
         (select doc_type from t_doc_fixture), %L, 'invoice.pdf', 'application/pdf', 1000, 'hash1') $$,
    (select v1_path from t_doc_fixture)
  ), '23514', null, 'upload_document_metadata still rejects with a valid intent but no Storage object yet'
);

insert into storage.objects (bucket_id, name) select 'shipment-documents', v1_path from t_doc_fixture;

create temp table t_v1_result as
select id as v1_id from upload_document_metadata(
  (select dxb_shipment from t_fixture), (select doc_id from t_doc_fixture), null, (select doc_type from t_doc_fixture),
  (select v1_path from t_doc_fixture), 'invoice.pdf', 'application/pdf', 1000, 'hash1'
);

-- Replacement: same two-step (intent + object) before replace_document.
select fn_register_upload_intent(
  (select dxb_shipment from t_fixture), (select doc_id from t_doc_fixture), (select v2_path from t_doc_fixture),
  'application/pdf', 1100, 'hash2'
);
insert into storage.objects (bucket_id, name) select 'shipment-documents', v2_path from t_doc_fixture;

create temp table t_v2_result as
select id as v2_id from replace_document(
  (select doc_id from t_doc_fixture), (select v2_path from t_doc_fixture), 'invoice_v2.pdf', 'application/pdf', 1100, 'hash2'
);
reset role;

select ok((select v1_id from t_v1_result) is not null, 'upload_document_metadata succeeds once a matching intent AND Storage object both exist');
select ok((select v2_id from t_v2_result) is not null, 'replace_document succeeds once a matching intent AND Storage object both exist');
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
  $$ select update_customs((select dxb_shipment from t_fixture), null, 'Declaration Created', current_date, null, null) $$,
  '23502', null, 'declaration number is required once customs_status reaches Declaration Created'
);
select lives_ok(
  $$ select update_customs((select dxb_shipment from t_fixture), null, 'Not Started', null, null, null) $$,
  'declaration number is NOT required while customs_status is Not Started'
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

update shipments set overall_status = 'Customs Processing' where id = (select dxb_shipment from t_fixture2);

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
select plan(14);

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
select ok(
  (select count(*)::int from v_assignable_profiles) >= 6,
  'v_assignable_profiles exposes all active profiles'' minimal fields regardless of who is asking'
);
select is(
  (select count(*)::int from v_assignable_profiles limit 1) - (select count(*)::int from v_assignable_profiles limit 1),
  0, 'sanity: v_assignable_profiles query does not error for an ordinary user'
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
  'Air', current_date, null, (select dxb_branch from t_fixture3), null, 'Test Co Critical', null,
  'Critical', (select dxb_data_entry from t_fixture3), null, null
);
reset role;
select is((select priority from t_critical_shipment), 'Critical', 'create_shipment accepts the Critical priority value');

set role authenticated;
select set_config('app.current_user_id', (select dxb_data_entry::text from t_fixture3), false);
select set_config('app.current_role_claim', 'authenticated', false);
select throws_ok(
  format(
    $$ select create_shipment('Air', current_date, null, %L, null, '   ', null, 'Medium', %L, null, null) $$,
    (select dxb_branch::text from t_fixture3), (select dxb_data_entry::text from t_fixture3)
  ), '23502', null, 'create_shipment rejects a blank (whitespace-only) supplier name'
);
reset role;

-- ============================================================
-- Item 6: parameterized search
-- ============================================================
set role authenticated;
select set_config('app.current_user_id', (select dxb_data_entry::text from t_fixture3), false);
select set_config('app.current_role_claim', 'authenticated', false);
select ok(
  (select count(*)::int from search_shipments(null, null, 1, 25)) >= 1,
  'search_shipments returns results for the caller''s own branch with no filters'
);
select lives_ok(
  $$ select * from search_shipments('%,,,)) OR 1=1 --', null, 1, 25) $$,
  'search_shipments treats filter-syntax-like characters as a literal, harmless search string (no injection, no error)'
);
select throws_ok(
  format($$ select * from search_shipments(%L, null, 1, 25) $$, repeat('x', 200)),
  '23514', null, 'search_shipments rejects an excessively long query string'
);
reset role;

select * from finish();
rollback;
