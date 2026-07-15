"use client";

import { useState, useRef } from "react";
import { Loader2 } from "lucide-react";
import { getSignedDownloadUrlAction, registerUploadIntentAction, finalizeReplaceAction, archiveDocumentAction, BUCKET } from "@/lib/actions/documents";
import { createClient } from "@/lib/supabase/client";
import { formatDubaiDate } from "@/lib/dates";

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function DocumentCard({
  shipmentId,
  documentId,
  typeName,
  filename,
  versionNumber,
  status,
  uploadedAt,
  uploadedByName,
  storagePath,
  canEdit,
}: {
  shipmentId: string;
  documentId: string;
  typeName: string;
  filename: string;
  versionNumber: number;
  status: string;
  uploadedAt: string;
  uploadedByName: string;
  storagePath: string;
  canEdit: boolean;
}) {
  const [previewing, setPreviewing] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handlePreview() {
    setPreviewing(true);
    const result = await getSignedDownloadUrlAction(storagePath);
    setPreviewing(false);
    if (result.url) window.open(result.url, "_blank", "noopener,noreferrer");
    else setError(result.error ?? "Couldn't preview.");
  }

  async function handleReplaceFile(file: File) {
    setReplacing(true);
    setError(null);
    try {
      const registerResult = await registerUploadIntentAction(shipmentId, file.name, file.size, file.type, documentId);
      if (registerResult.error || !registerResult.intent) throw new Error(registerResult.error ?? "Couldn't register the upload.");
      const { storagePath: newPath } = registerResult.intent;

      const supabase = createClient();
      const { data: signed, error: signError } = await supabase.storage.from(BUCKET).createSignedUploadUrl(newPath);
      if (signError || !signed) throw new Error("Couldn't get an upload location.");

      const { error: uploadError } = await supabase.storage.from(BUCKET).uploadToSignedUrl(newPath, signed.token, file, {
        contentType: file.type || "application/octet-stream",
      });
      if (uploadError) throw new Error("Upload failed: " + uploadError.message);

      const hash = await sha256Hex(file);
      const finalizeResult = await finalizeReplaceAction({
        shipment_id: shipmentId,
        document_id: documentId,
        storage_path: newPath,
        original_filename: file.name,
        mime_type: file.type,
        file_size: file.size,
        sha256_hash: hash,
      });
      if (finalizeResult.error) throw new Error(finalizeResult.error);

      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Replace failed.");
    } finally {
      setReplacing(false);
    }
  }

  async function handleArchive() {
    const reason = window.prompt("Reason for archiving this document:");
    if (!reason) return;
    setArchiving(true);
    const result = await archiveDocumentAction(documentId, shipmentId, reason);
    setArchiving(false);
    if (result.error) setError(result.error);
    else window.location.reload();
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-[12.5px] font-semibold text-ink">{filename}</div>
      <div className="mb-2 text-[11px] text-ink-muted">{typeName} · v{versionNumber}</div>
      <div className="text-[11px] text-ink-muted">
        Uploaded {formatDubaiDate(uploadedAt)} by {uploadedByName}
      </div>
      <div className="mt-1.5">
        <span className="text-[11px] font-bold text-primary-dark">{status}</span>
      </div>
      {error && <p className="mt-1.5 text-[11px] text-danger">{error}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          onClick={handlePreview}
          disabled={previewing}
          className="rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-ink transition hover:bg-surface-muted disabled:opacity-60"
        >
          {previewing ? <Loader2 className="h-3 w-3 animate-spin" /> : "Preview"}
        </button>
        {canEdit && (
          <>
            <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && handleReplaceFile(e.target.files[0])} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={replacing}
              className="rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-ink transition hover:bg-surface-muted disabled:opacity-60"
            >
              {replacing ? "Replacing…" : "Replace"}
            </button>
            <button
              onClick={handleArchive}
              disabled={archiving}
              className="rounded-md border border-danger/40 bg-surface px-2.5 py-1 text-[11px] font-medium text-danger transition hover:bg-danger-light disabled:opacity-60"
            >
              {archiving ? "Archiving…" : "Archive"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
