"use server";

import { PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Client, getR2BucketName } from "@/lib/storage/r2-client";
import { createClient } from "@/lib/supabase/server";

const UPLOAD_URL_TTL_SECONDS = 300;
const DOWNLOAD_URL_TTL_SECONDS = 300;

/**
 * R2 (like any S3-compatible object store) has no concept of Postgres RLS —
 * it will honor a presigned URL for whoever holds it, full stop. Under
 * Supabase Storage, the equivalent checks lived in RLS policies on
 * storage.objects (p_storage_insert_documents / p_storage_select_documents)
 * and ran automatically on every request. Moving to R2 means that
 * enforcement has to move HERE — into the moment a presigned URL is
 * minted — since nothing downstream will check again. Every check below
 * is a deliberate, explicit port of one of those two policies, not new
 * logic invented for this migration.
 */

export type UploadUrlState = { url?: string; error?: string };

/**
 * Replicates p_storage_insert_documents' WITH CHECK exactly: a matching,
 * unexpired, unfulfilled upload_intents row must exist, owned by the
 * calling user, for this exact shipment/document/path combination.
 * fn_register_upload_intent must have already been called (and
 * succeeded) before this will return anything.
 */
export async function getR2UploadUrlAction(
  shipmentId: string,
  documentId: string,
  storagePath: string,
  contentType: string
): Promise<UploadUrlState> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return { error: "AUTH_REQUIRED: not signed in." };
  }

  const { data: intent, error: intentError } = await supabase
    .from("upload_intents")
    .select("id, requested_by, fulfilled, expires_at")
    .eq("shipment_id", shipmentId)
    .eq("document_id", documentId)
    .eq("storage_path", storagePath)
    .maybeSingle();

  if (intentError || !intent) {
    return { error: "No matching upload was registered for this file. Try again from the start." };
  }
  if (intent.requested_by !== userData.user.id) {
    return { error: "This upload belongs to a different session." };
  }
  if (intent.fulfilled) {
    return { error: "This upload has already been completed." };
  }
  if (new Date(intent.expires_at).getTime() < Date.now()) {
    return { error: "This upload took too long to start and has expired. Try again." };
  }

  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: getR2BucketName(),
    Key: storagePath,
    ContentType: contentType || "application/octet-stream",
  });
  const url = await getSignedUrl(client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
  return { url };
}

export type DownloadUrlState = { url?: string; error?: string };

/**
 * Replicates p_storage_select_documents' USING clause exactly: the caller
 * can only get a download URL for a document whose shipment they can
 * actually see — own branch, or view_all_branches. Queries THROUGH the
 * normal (RLS-respecting) Supabase client rather than a service-role
 * client, specifically so shipments' own existing branch-scoping RLS is
 * what decides visibility here too — this function doesn't re-implement
 * that logic, it just asks the same question the database already
 * enforces everywhere else.
 */
export async function getR2DownloadUrlAction(storagePath: string): Promise<DownloadUrlState> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return { error: "AUTH_REQUIRED: not signed in." };
  }

  const { data: canAccess, error: accessError } = await supabase.rpc("fn_can_access_document_by_path", {
    p_storage_path: storagePath,
  });
  if (accessError || !canAccess) {
    return { error: "Couldn't find that document, or you don't have access to it." };
  }

  const client = getR2Client();
  const command = new GetObjectCommand({ Bucket: getR2BucketName(), Key: storagePath });
  const url = await getSignedUrl(client, command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
  return { url };
}

/**
 * upload_document_metadata / replace_document used to verify the object
 * actually existed by checking Supabase's OWN storage.objects table
 * directly in SQL — R2 objects will never appear there, so that check is
 * removed from the SQL functions (see the accompanying migration) and
 * replaced with this: a real HeadObject call against R2 itself, done here
 * in application code right before the metadata RPC is called, so a
 * phantom metadata row still can't be registered for a file that was
 * never actually uploaded.
 */
export async function verifyR2ObjectExistsAction(storagePath: string): Promise<{ exists: boolean }> {
  try {
    const client = getR2Client();
    await client.send(new HeadObjectCommand({ Bucket: getR2BucketName(), Key: storagePath }));
    return { exists: true };
  } catch {
    return { exists: false };
  }
}
