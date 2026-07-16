"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendlyRpcError } from "@/lib/actions/errors";
import type { ParsedStagingRow } from "@/lib/import-parser";

export type ImportActionState = { error?: string; success?: boolean };

export async function createImportBatchAction(
  fileName: string,
  fileSha256: string,
  chunkSize: number
): Promise<{ batchId?: string; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_import_batch", {
    p_file_name: fileName,
    p_file_sha256: fileSha256,
    p_chunk_size: chunkSize,
  });
  if (error) return { error: friendlyRpcError(error.message) };
  return { batchId: data.id };
}

/**
 * Stages ONE chunk of rows and returns. Server Actions can't accept
 * callback functions as arguments (function props aren't serializable
 * across the client/server boundary) — so the chunking LOOP and its
 * progress reporting live on the client (see ImportWizard), which calls
 * this action repeatedly and updates its own state between calls.
 */
export async function stageImportRowsChunkAction(
  batchId: string,
  rows: ParsedStagingRow[]
): Promise<{ staged: number; skipped: number; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("stage_import_rows", {
    p_batch_id: batchId,
    p_rows: rows,
  });
  if (error) return { staged: 0, skipped: 0, error: friendlyRpcError(error.message) };
  return { staged: data?.[0]?.staged_count ?? 0, skipped: data?.[0]?.skipped_count ?? 0 };
}

export async function validateImportBatchAction(batchId: string): Promise<ImportActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_validate_import_batch", { p_batch_id: batchId });
  if (error) return { error: friendlyRpcError(error.message) };
  revalidatePath("/import");
  return { success: true };
}

export async function setReconciliationExpectedAction(
  batchId: string,
  monthLabel: string,
  expectedCount: number
): Promise<ImportActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_import_reconciliation_expected", {
    p_batch_id: batchId,
    p_month_label: monthLabel,
    p_expected_count: expectedCount,
  });
  if (error) return { error: friendlyRpcError(error.message) };
  return { success: true };
}

/**
 * Commits ONE chunk (fn_commit_import_batch_chunk is already chunked and
 * resumable server-side — item 11 from the original SQL review). Same
 * reasoning as stageImportRowsChunkAction above: the client drives the
 * repeat-until-done loop and shows its own progress, since a callback
 * can't cross the Server Action boundary.
 */
export async function commitImportBatchChunkAction(
  batchId: string,
  defaultBranchId: string,
  defaultCategoryId: string
): Promise<{ committedThisChunk: number; remaining: number; batchStatus: string; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_commit_import_batch_chunk", {
    p_batch_id: batchId,
    p_default_branch_id: defaultBranchId,
    p_default_category_id: defaultCategoryId,
  });
  if (error) return { committedThisChunk: 0, remaining: 0, batchStatus: "Failed", error: friendlyRpcError(error.message) };
  const result = data?.[0];
  if (result?.remaining === 0) revalidatePath("/import");
  return {
    committedThisChunk: result?.committed_this_chunk ?? 0,
    remaining: result?.remaining ?? 0,
    batchStatus: result?.batch_status ?? "Failed",
  };
}

export async function getImportBatchStatusAction(batchId: string): Promise<{ data?: unknown; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_import_batch_status", { p_batch_id: batchId });
  if (error) return { error: friendlyRpcError(error.message) };
  return { data };
}
