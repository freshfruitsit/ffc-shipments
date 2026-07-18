"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyRpcError } from "@/lib/actions/errors";
import type { ActionState } from "@/lib/actions/shipment-detail";
import { getR2DownloadUrlAction, verifyR2ObjectExistsAction } from "@/lib/actions/r2-storage";

export type RegisterUploadState = {
  error?: string;
  intent?: { documentId: string; storagePath: string };
};

const RegisterSchema = z.object({
  shipment_id: z.string().uuid(),
  file_name: z.string().trim().min(1),
  file_size: z.coerce.number().int().positive(),
  mime_type: z.string().trim().optional(),
});

/**
 * Step 1 of the upload flow: mint a document_id + storage path following the
 * shipments/{shipment_id}/{document_id}/{filename} convention, and register
 * an upload_intents row via the RPC — this is what the Storage INSERT
 * policy checks before allowing the actual file upload.
 *
 * Pass existingDocumentId for a "Replace" flow (new version of an existing
 * document) — otherwise a fresh document_id is minted for a brand new one.
 */
export async function registerUploadIntentAction(
  shipmentId: string,
  fileName: string,
  fileSize: number,
  mimeType: string,
  existingDocumentId?: string
): Promise<RegisterUploadState> {
  const parsed = RegisterSchema.safeParse({ shipment_id: shipmentId, file_name: fileName, file_size: fileSize, mime_type: mimeType });
  if (!parsed.success) {
    return { error: "Invalid file details." };
  }

  const supabase = await createClient();
  const documentId = existingDocumentId ?? randomUUID();
  const safeFileName = parsed.data.file_name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `shipments/${shipmentId}/${documentId}/${safeFileName}`;

  const { error } = await supabase.rpc("fn_register_upload_intent", {
    p_shipment_id: shipmentId,
    p_document_id: documentId,
    p_storage_path: storagePath,
    p_expected_mime_type: mimeType || null,
    p_expected_file_size: fileSize,
    p_expected_sha256_hash: null,
  });

  if (error) {
    return { error: friendlyRpcError(error.message) };
  }

  return { intent: { documentId, storagePath } };
}

const FinalizeSchema = z.object({
  shipment_id: z.string().uuid(),
  document_id: z.string().uuid(),
  document_type_id: z.string().uuid(),
  invoice_id: z.string().uuid().optional().or(z.literal("")),
  storage_path: z.string().min(1),
  original_filename: z.string().min(1),
  mime_type: z.string().optional(),
  file_size: z.coerce.number().int().positive(),
  sha256_hash: z.string().min(1),
});

/**
 * Step 2 (after the browser has uploaded the actual bytes to R2 via the
 * presigned URL): record the document metadata. upload_document_metadata
 * no longer verifies the object exists itself (R2 objects don't live
 * anywhere Postgres can see directly) — that verification happens right
 * here instead, via a real HeadObject call against R2, before the RPC is
 * ever called. Same guarantee as before (item 5 of the original round-3
 * SQL review), just enforced at the layer that can actually reach R2.
 */
export async function finalizeUploadAction(input: {
  shipment_id: string;
  document_id: string;
  document_type_id: string;
  invoice_id?: string;
  storage_path: string;
  original_filename: string;
  mime_type?: string;
  file_size: number;
  sha256_hash: string;
}): Promise<ActionState> {
  const parsed = FinalizeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid upload details." };
  }
  const d = parsed.data;

  const { exists } = await verifyR2ObjectExistsAction(d.storage_path);
  if (!exists) {
    return { error: "The file doesn't appear to have finished uploading. Try again." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("upload_document_metadata", {
    p_shipment_id: d.shipment_id,
    p_document_id: d.document_id,
    p_invoice_id: d.invoice_id || null,
    p_document_type_id: d.document_type_id,
    p_storage_path: d.storage_path,
    p_original_filename: d.original_filename,
    p_mime_type: d.mime_type || null,
    p_file_size: d.file_size,
    p_sha256_hash: d.sha256_hash,
  });
  if (error) return { error: friendlyRpcError(error.message) };
  revalidatePath(`/shipments/${d.shipment_id}/documents`);
  return { success: true };
}

/** Now generates an R2 presigned GET URL instead of a Supabase Storage one — see lib/actions/r2-storage.ts for the permission check this replicates. */
export async function getSignedDownloadUrlAction(storagePath: string): Promise<{ url?: string; error?: string }> {
  const result = await getR2DownloadUrlAction(storagePath);
  if (result.error || !result.url) return { error: result.error ?? "Couldn't generate a download link." };
  return { url: result.url };
}

const FinalizeReplaceSchema = z.object({
  shipment_id: z.string().uuid(),
  document_id: z.string().uuid(),
  storage_path: z.string().min(1),
  original_filename: z.string().min(1),
  mime_type: z.string().optional(),
  file_size: z.coerce.number().int().positive(),
  sha256_hash: z.string().min(1),
});

/** Same two-step contract as finalizeUploadAction, but for a new VERSION of an existing document (replace_document, not upload_document_metadata). */
export async function finalizeReplaceAction(input: {
  shipment_id: string;
  document_id: string;
  storage_path: string;
  original_filename: string;
  mime_type?: string;
  file_size: number;
  sha256_hash: string;
}): Promise<ActionState> {
  const parsed = FinalizeReplaceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid upload details." };
  }
  const d = parsed.data;

  const { exists } = await verifyR2ObjectExistsAction(d.storage_path);
  if (!exists) {
    return { error: "The file doesn't appear to have finished uploading. Try again." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("replace_document", {
    p_document_id: d.document_id,
    p_storage_path: d.storage_path,
    p_original_filename: d.original_filename,
    p_mime_type: d.mime_type || null,
    p_file_size: d.file_size,
    p_sha256_hash: d.sha256_hash,
  });
  if (error) return { error: friendlyRpcError(error.message) };
  revalidatePath(`/shipments/${d.shipment_id}/documents`);
  return { success: true };
}

export async function verifyDocumentAction(documentVersionId: string, shipmentId: string, approve: boolean, remarks?: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("verify_document", {
    p_document_version_id: documentVersionId,
    p_approve: approve,
    p_remarks: remarks || null,
  });
  if (error) return { error: friendlyRpcError(error.message) };
  revalidatePath(`/shipments/${shipmentId}/documents`);
  return { success: true };
}

export async function archiveDocumentAction(documentVersionId: string, shipmentId: string, reason: string): Promise<ActionState> {
  if (!reason.trim()) {
    return { error: "A reason is required to archive a document." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_document", { p_document_version_id: documentVersionId, p_reason: reason });
  if (error) return { error: friendlyRpcError(error.message) };
  revalidatePath(`/shipments/${shipmentId}/documents`);
  return { success: true };
}
