"use client";

import { useState, useRef } from "react";
import { Upload, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { registerUploadIntentAction, finalizeUploadAction } from "@/lib/actions/documents";
import { BUCKET } from "@/lib/storage-constants";
import { selectClass } from "@/components/ui/form";

type DocType = { id: string; name: string };

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function DocumentUploadForm({
  shipmentId, documentTypes, onUploaded,
}: {
  shipmentId: string; documentTypes: DocType[]; onUploaded?: () => void;
}) {
  const [documentTypeId, setDocumentTypeId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "error" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    if (!file || !documentTypeId) {
      setError("Choose a document type and a file first.");
      setStatus("error");
      return;
    }
    setStatus("uploading");
    setError(null);

    try {
      // Step 1: register the intent — the RPC checks branch access +
      // upload_docs permission before an object can ever be written.
      const registerResult = await registerUploadIntentAction(shipmentId, file.name, file.size, file.type);
      if (registerResult.error || !registerResult.intent) {
        throw new Error(registerResult.error ?? "Couldn't register the upload.");
      }
      const { documentId, storagePath } = registerResult.intent;

      // Step 2: upload the actual bytes DIRECTLY to Storage from the
      // browser, using a signed upload URL — never routed through a Server
      // Action (which would hit body-size limits for large PDFs/scans).
      const supabase = createClient();
      const { data: signed, error: signError } = await supabase.storage
        .from(BUCKET)
        .createSignedUploadUrl(storagePath);
      if (signError || !signed) {
        throw new Error("Couldn't get an upload location. " + (signError?.message ?? ""));
      }

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(storagePath, signed.token, file, {
          contentType: file.type || "application/octet-stream",
        });
      if (uploadError) {
        throw new Error("Upload failed: " + uploadError.message);
      }

      // Step 3: hash the file client-side and finalize the metadata row —
      // upload_document_metadata re-verifies the object actually exists and
      // the intent is valid before accepting this, so a client that lies
      // about the hash/size still can't register a phantom row.
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
      if (finalizeResult.error) {
        throw new Error(finalizeResult.error);
      }

      setStatus("done");
      setFile(null);
      setDocumentTypeId("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      // In the wizard, a full reload would wipe the in-memory step/
      // shipmentId state and dump the user back to step 1 — onUploaded
      // lets the caller refresh just its own document list instead. The
      // standalone Documents tab doesn't pass this prop, so it keeps the
      // simpler reload (there's no wizard state to lose there).
      if (onUploaded) onUploaded();
      else window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setStatus("error");
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-border bg-surface-muted/40 p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-ink">Document type</label>
          <select value={documentTypeId} onChange={(e) => setDocumentTypeId(e.target.value)} className={selectClass}>
            <option value="">Select type…</option>
            {documentTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-ink">File</label>
          <input
            ref={fileInputRef}
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-md file:border-0 file:bg-primary-light file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-dark"
          />
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {status === "done" && <p className="text-sm text-success">Uploaded successfully.</p>}

      <button
        type="button"
        onClick={handleUpload}
        disabled={status === "uploading" || !file || !documentTypeId}
        className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-dark disabled:opacity-60"
      >
        {status === "uploading" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" /> Upload document
          </>
        )}
      </button>
    </div>
  );
}
