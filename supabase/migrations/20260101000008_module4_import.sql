-- ============================================================
-- HISTORICAL IMPORT — staging RPCs.
--
-- fn_validate_import_batch and fn_commit_import_batch_chunk already existed
-- (Module 1.1) and expect import_staging_rows to already contain data —
-- but nothing ever wrote to that table. There is no Supabase Edge Function
-- in this project (no Docker in this sandbox to build/test one), so the
-- Excel file is parsed CLIENT-SIDE in the browser (SheetJS/xlsx, already a
-- normal, legitimate pattern for admin-only bulk-upload tools — see
-- lib/actions/import.ts) and the parsed rows are shipped here as JSONB.
-- These RPCs are what actually get that parsed data into the table.
-- ============================================================

create or replace function create_import_batch(p_file_name text, p_file_sha256 text, p_chunk_size int default 500)
returns public.import_batches
language plpgsql security definer set search_path = ''
as $$
declare
  v_admin public.profiles;
  v_batch public.import_batches;
begin
  v_admin := public.fn_require_permission('administer');

  if exists (select 1 from public.import_batches where file_sha256 = p_file_sha256) then
    raise exception 'DUPLICATE_FILE: this exact file has already been imported (or attempted) as a batch' using errcode = '23505';
  end if;

  insert into public.import_batches (file_name, file_sha256, uploaded_by, status, chunk_size)
  values (p_file_name, p_file_sha256, v_admin.id, 'Uploaded', greatest(coalesce(p_chunk_size, 500), 1))
  returning * into v_batch;

  return v_batch;
end;
$$;
revoke all on function create_import_batch(text,text,int) from public;
grant execute on function create_import_batch(text,text,int) to authenticated;

-- Bulk-stages parsed rows. p_rows is a JSONB array of
-- {source_row_number, source_month, raw_values}. Runs the same per-row
-- isolation pattern as fn_commit_import_batch_chunk (item 11) — one
-- malformed row in the uploaded file (e.g. genuinely corrupt JSON shape)
-- is skipped and reported, not allowed to abort staging the rest of a
-- ~5,000-row file.
create or replace function stage_import_rows(p_batch_id uuid, p_rows jsonb)
returns table(staged_count int, skipped_count int)
language plpgsql security definer set search_path = ''
as $$
declare
  v_batch public.import_batches;
  v_row jsonb;
  v_staged int := 0;
  v_skipped int := 0;
begin
  perform public.fn_require_permission('administer');

  select * into v_batch from public.import_batches where id = p_batch_id;
  if v_batch.id is null then
    raise exception 'NOT_FOUND: import batch % does not exist', p_batch_id using errcode = 'P0002';
  end if;
  if v_batch.status not in ('Uploaded', 'Parsing') then
    raise exception 'BATCH_NOT_STAGEABLE: batch % is % — rows can only be staged while Uploaded/Parsing', p_batch_id, v_batch.status
      using errcode = '23514';
  end if;

  update public.import_batches set status = 'Parsing' where id = p_batch_id;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    begin
      insert into public.import_staging_rows (batch_id, source_row_number, source_month, raw_values, validation_status)
      values (
        p_batch_id,
        (v_row->>'source_row_number')::int,
        v_row->>'source_month',
        coalesce(v_row->'raw_values', '{}'::jsonb),
        'Pending'
      )
      on conflict (batch_id, source_row_number) do update set
        source_month = excluded.source_month, raw_values = excluded.raw_values, validation_status = 'Pending';
      v_staged := v_staged + 1;
    exception when others then
      v_skipped := v_skipped + 1;
    end;
  end loop;

  return query select v_staged, v_skipped;
end;
$$;
revoke all on function stage_import_rows(uuid, jsonb) from public;
grant execute on function stage_import_rows(uuid, jsonb) to authenticated;

-- Sets/updates the expected-count-per-month table an operator enters
-- (typically read off the source file's own month totals, e.g. this
-- project's known 2025 Mirsal figures) BEFORE committing — this is what
-- fn_commit_import_batch_chunk's reconciliation gate checks against.
create or replace function set_import_reconciliation_expected(p_batch_id uuid, p_month_label text, p_expected_count int)
returns public.import_monthly_reconciliation
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.import_monthly_reconciliation;
begin
  perform public.fn_require_permission('administer');
  if not exists (select 1 from public.import_batches where id = p_batch_id) then
    raise exception 'NOT_FOUND: import batch % does not exist', p_batch_id using errcode = 'P0002';
  end if;
  if p_expected_count < 0 then
    raise exception 'INVALID_VALUE: expected_count cannot be negative' using errcode = '23514';
  end if;

  insert into public.import_monthly_reconciliation (batch_id, month_label, expected_count)
  values (p_batch_id, p_month_label, p_expected_count)
  on conflict (batch_id, month_label) do update set expected_count = excluded.expected_count
  returning * into v_row;

  return v_row;
end;
$$;
revoke all on function set_import_reconciliation_expected(uuid,text,int) from public;
grant execute on function set_import_reconciliation_expected(uuid,text,int) to authenticated;

-- Read helper: full batch status + staging-row validation summary +
-- reconciliation rows, in one call — the Import screen's main polling
-- query as the batch moves through staging/validating/committing.
create or replace function get_import_batch_status(p_batch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_batch public.import_batches;
begin
  perform public.fn_require_permission('administer');
  select * into v_batch from public.import_batches where id = p_batch_id;
  if v_batch.id is null then
    raise exception 'NOT_FOUND: import batch % does not exist', p_batch_id using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'batch', to_jsonb(v_batch),
    'reconciliation', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.month_label), '[]'::jsonb)
      from public.import_monthly_reconciliation r where r.batch_id = p_batch_id
    ),
    'issues', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'staging_row_id', i.staging_row_id, 'issue_code', i.issue_code,
        'issue_message', i.issue_message, 'severity', i.severity,
        'source_row_number', s.source_row_number
      ) order by s.source_row_number), '[]'::jsonb)
      from public.import_validation_issues i
      join public.import_staging_rows s on s.id = i.staging_row_id
      where s.batch_id = p_batch_id
      limit 500
    )
  );
end;
$$;
revoke all on function get_import_batch_status(uuid) from public;
grant execute on function get_import_batch_status(uuid) to authenticated;

-- List helper for the Import landing page (past batches).
create or replace function list_import_batches(p_page int default 1, p_page_size int default 20)
returns table (
  id uuid, file_name text, status public.import_batch_status, total_rows int, valid_rows int,
  warning_rows int, invalid_rows int, uploaded_at timestamptz, committed_at timestamptz,
  reconciliation_passed boolean, failure_reason text, total_count bigint
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_page int;
  v_page_size int;
begin
  perform public.fn_require_permission('administer');
  v_page := greatest(coalesce(p_page, 1), 1);
  v_page_size := least(greatest(coalesce(p_page_size, 20), 1), 100);

  return query
  select b.id, b.file_name, b.status, b.total_rows, b.valid_rows, b.warning_rows, b.invalid_rows,
    b.uploaded_at, b.committed_at, b.reconciliation_passed, b.failure_reason,
    count(*) over ()::bigint as total_count
  from public.import_batches b
  order by b.uploaded_at desc
  limit v_page_size offset (v_page - 1) * v_page_size;
end;
$$;
revoke all on function list_import_batches(int,int) from public;
grant execute on function list_import_batches(int,int) to authenticated;
