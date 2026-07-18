"use client";

import { useState, useRef } from "react";
import { Loader2, Upload } from "lucide-react";
import { registerUploadIntentAction, finalizeUploadAction } from "@/lib/actions/documents";
import { getR2UploadUrlAction } from "@/lib/actions/r2-storage";

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Per direct request, replaces the per-type required-documents checklist:
 * one shipment, one combined document (every paper merged into a single
 * file), one Verify tick — not five separate required types each with
 * their own slot. This component only ever handles the "nothing uploaded
 * yet" state; once a document exists, the caller renders it via the real
 * DocumentCard (Preview/Replace/Archive/Verify) instead of this.
 */
export function SingleDocumentUpload({
  shipmentId, documentTypeId, onUploaded,
}: {
  shipmentId: string; documentTypeId: string; onUploaded?: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setStatus("uploading");
    setError(null);
    try {
      const registerResult = await registerUploadIntentAction(shipmentId, file.name, file.size, file.type);
      if (registerResult.error || !registerResult.intent) throw new Error(registerResult.error ?? "Couldn't register the upload.");
      const { documentId, storagePath } = registerResult.intent;

      const contentType = file.type || "application/octet-stream";
      const signedResult = await getR2UploadUrlAction(shipmentId, documentId, storagePath, contentType);
      if (signedResult.error || !signedResult.url) throw new Error(signedResult.error ?? "Couldn't get an upload location.");

      const putResponse = await fetch(signedResult.url, { method: "PUT", body: file, headers: { "Content-Type": contentType } });
      if (!putResponse.ok) throw new Error(`Upload failed (${putResponse.status}).`);

      const hash = await sha256Hex(file);
      const finalizeResult = await finalizeUploadAction({
        shipment_id: shipmentId,
        document_id: documentId,
        document_type_id: documentTypeId,
        storage_path: storagePath,
        original_filename: file.name,
        mime_type: file.type,
        file_size: file.size,
        sha256_hash: hash,
      });
      if (finalizeResult.error) throw new Error(finalizeResult.error);

      setStatus("idle");
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (onUploaded) onUploaded(); else window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setStatus("error");
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-border bg-surface-muted/40 p-6 text-center">
      <p className="mb-1 text-sm font-medium text-ink">Upload Shipment Documents</p>
      <p className="mb-3 text-xs text-ink-muted">
        One file covering everything for this shipment — combine multiple pages into a single PDF if needed.
      </p>
      <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={status === "uploading"}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-dark disabled:opacity-60"
      >
        {status === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {status === "uploading" ? "Uploading…" : "Choose file"}
      </button>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
