"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyRpcError } from "@/lib/actions/errors";
import type { ActionState } from "@/lib/actions/shipment-detail";

const BUCKET = "shipment-documents";

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
 */
export async function registerUploadIntentAction(
  shipmentId: string,
  fileName: string,
  fileSize: number,
  mimeType: string
): Promise<RegisterUploadState> {
  const parsed = RegisterSchema.safeParse({ shipment_id: shipmentId, file_name: fileName, file_size: fileSize, mime_type: mimeType });
  if (!parsed.success) {
    return { error: "Invalid file details." };
  }

  const supabase = await createClient();
  const documentId = randomUUID();
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
 * Step 2 (after the browser has uploaded the actual bytes to Storage via
 * the signed URL): record the document metadata. upload_document_metadata
 * itself re-verifies the Storage object actually exists and the intent is
 * valid/unfulfilled before accepting this — see item 5 of the round-3
 * SQL review.
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
  const supabase = await createClient();
  const d = parsed.data;
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

export async function getSignedDownloadUrlAction(storagePath: string): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 300);
  if (error || !data) return { error: "Couldn't generate a download link." };
  return { url: data.signedUrl };
}

export { BUCKET };
