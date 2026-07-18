"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { DocumentCard } from "@/components/shipments/tabs/document-card";
import { SingleDocumentUpload } from "@/components/shipments/tabs/single-document-upload";

type Option = { id: string; name: string };
type DocumentsData = {
  documents: {
    document_id: string; document_type_id: string; document_type_name: string;
    current_version: {
      id: string; version_number: number; status: string; storage_path: string; original_filename: string;
      uploaded_at: string; uploaded_by_name: string | null;
    };
  }[];
  can_upload: boolean;
  can_verify: boolean;
};

export function Step4Documents({
  shipmentId,
  documentTypes,
  onNext,
  onBack,
  onSaveAsDraft,
}: {
  shipmentId: string;
  documentTypes: Option[];
  onNext: () => void;
  onBack: () => void;
  onSaveAsDraft: () => void;
}) {
  const [tab, setTab] = useState<DocumentsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("get_shipment_documents_tab", { p_shipment_id: shipmentId });
    if (rpcError) {
      setError("Couldn't load the document list right now.");
      return;
    }
    setTab(data as unknown as DocumentsData);
    setError(null);
  }, [shipmentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  // Per direct request: one shipment, one combined document, one Verify
  // tick — not a per-type checklist.
  const document = tab?.documents[0] ?? null;
  const shipmentDocsType = documentTypes.find((t) => t.name === "Shipment Documents");

  return (
    <div>
      <p className="mb-3 text-[12.5px] text-ink-muted">
        Upload one file covering everything for this shipment — combine multiple pages into a single PDF
        if needed.
      </p>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {tab && (
        <div className="mb-4 max-w-sm">
          {document ? (
            <DocumentCard
              shipmentId={shipmentId}
              documentId={document.document_id}
              documentVersionId={document.current_version.id}
              typeName={document.document_type_name}
              filename={document.current_version.original_filename}
              versionNumber={document.current_version.version_number}
              status={document.current_version.status}
              uploadedAt={document.current_version.uploaded_at}
              uploadedByName={document.current_version.uploaded_by_name ?? "Unknown"}
              storagePath={document.current_version.storage_path}
              canEdit={tab.can_upload}
              canVerify={tab.can_verify}
              onChanged={refresh}
            />
          ) : tab.can_upload && shipmentDocsType ? (
            <SingleDocumentUpload shipmentId={shipmentId} documentTypeId={shipmentDocsType.id} onUploaded={refresh} />
          ) : (
            <p className="rounded-lg border border-dashed border-border bg-surface-muted/40 p-4 text-center text-sm text-ink-muted">
              No document uploaded yet.
            </p>
          )}
        </div>
      )}

      <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
        <button type="button" onClick={onSaveAsDraft} className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted">
          Save as Draft
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onBack} className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted">
            Back
          </button>
          <button type="button" onClick={onNext} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
