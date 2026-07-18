"use client";

import { useState, useRef } from "react";
import { Loader2 } from "lucide-react";
import { getSignedDownloadUrlAction, registerUploadIntentAction, finalizeReplaceAction, archiveDocumentAction, verifyDocumentAction } from "@/lib/actions/documents";
import { getR2UploadUrlAction } from "@/lib/actions/r2-storage";
import { formatDubaiDate } from "@/lib/dates";

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function DocumentCard({
  shipmentId,
  documentId,
  documentVersionId,
  typeName,
  filename,
  versionNumber,
  status,
  uploadedAt,
  uploadedByName,
  storagePath,
  canEdit,
  canVerify,
  onChanged,
}: {
  shipmentId: string;
  documentId: string;
  documentVersionId: string;
  typeName: string;
  filename: string;
  versionNumber: number;
  status: string;
  uploadedAt: string;
  uploadedByName: string;
  storagePath: string;
  canEdit: boolean;
  canVerify: boolean;
  onChanged?: () => void;
}) {
  const [previewing, setPreviewing] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [verifying, setVerifying] = useState(false);
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

      const contentType = file.type || "application/octet-stream";
      const signedResult = await getR2UploadUrlAction(shipmentId, documentId, newPath, contentType);
      if (signedResult.error || !signedResult.url) throw new Error(signedResult.error ?? "Couldn't get an upload location.");

      const putResponse = await fetch(signedResult.url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": contentType },
      });
      if (!putResponse.ok) throw new Error(`Upload failed (${putResponse.status}).`);

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

      if (onChanged) onChanged(); else window.location.reload();
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
    // Item (bug found while wiring Verify): this used to pass documentId
    // here — archive_document's SQL signature expects the VERSION id
    // (p_document_version_id), which is a different row entirely. Every
    // Archive attempt was failing with NOT_FOUND before this fix, since
    // no document_versions row has an id matching a documents.id.
    const result = await archiveDocumentAction(documentVersionId, shipmentId, reason);
    setArchiving(false);
    if (result.error) {
      setError(result.error);
    } else if (onChanged) {
      onChanged();
    } else {
      window.location.reload();
    }
  }

  async function handleVerify(approve: boolean) {
    let remarks: string | undefined;
    if (!approve) {
      const reason = window.prompt("Reason for rejecting this document:");
      if (!reason) return;
      remarks = reason;
    }
    setVerifying(true);
    setError(null);
    const result = await verifyDocumentAction(documentVersionId, shipmentId, approve, remarks);
    setVerifying(false);
    if (result.error) {
      setError(result.error);
    } else if (onChanged) {
      onChanged();
    } else {
      window.location.reload();
    }
  }

  const canDecide = canVerify && (status === "Uploaded");

  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-[12.5px] font-semibold text-ink">{filename}</div>
      <div className="mb-2 text-[11px] text-ink-muted">{typeName} · v{versionNumber}</div>
      <div className="text-[11px] text-ink-muted">
        Uploaded {formatDubaiDate(uploadedAt)} by {uploadedByName}
      </div>
      <div className="mt-1.5">
        <span className={`text-[11px] font-bold ${status === "Rejected" ? "text-danger" : status === "Verified" ? "text-primary-dark" : "text-warning"}`}>
          {status}
        </span>
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
        {canDecide && (
          <>
            <button
              onClick={() => handleVerify(true)}
              disabled={verifying}
              className="rounded-md border border-primary/40 bg-primary-light px-2.5 py-1 text-[11px] font-medium text-primary-dark transition hover:bg-primary-light/70 disabled:opacity-60"
            >
              {verifying ? "…" : "Verify"}
            </button>
            <button
              onClick={() => handleVerify(false)}
              disabled={verifying}
              className="rounded-md border border-danger/40 bg-surface px-2.5 py-1 text-[11px] font-medium text-danger transition hover:bg-danger-light disabled:opacity-60"
            >
              {verifying ? "…" : "Reject"}
            </button>
          </>
        )}
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
