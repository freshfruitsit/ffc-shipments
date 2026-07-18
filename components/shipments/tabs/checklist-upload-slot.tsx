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
 * One checklist row's upload control — the document TYPE is already
 * fixed (it's this row), so there's no dropdown, just pick a file and
 * it uploads against exactly the type this slot represents. Same
 * register → R2 presigned PUT → finalize sequence as the general
 * DocumentUploadForm, just without needing a type selector.
 */
export function ChecklistUploadSlot({
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
    <div className="flex items-center gap-2">
      <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={status === "uploading"}
        className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-ink transition hover:bg-surface-muted disabled:opacity-60"
      >
        {status === "uploading" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
        {status === "uploading" ? "Uploading…" : "Choose file"}
      </button>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  );
}
