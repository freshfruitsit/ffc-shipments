"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { DocumentUploadForm } from "@/components/shipments/tabs/document-upload-form";
import { DocumentCard } from "@/components/shipments/tabs/document-card";
import { DocumentChecklist, type ChecklistItem } from "@/components/shipments/tabs/document-checklist";

type Option = { id: string; name: string };
type DocumentsData = {
  documents: {
    document_id: string; document_type_id: string; document_type_name: string;
    current_version: {
      id: string; version_number: number; status: string; storage_path: string; original_filename: string;
      uploaded_at: string; uploaded_by_name: string | null;
    };
  }[];
  checklist: ChecklistItem[];
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

  // Item (screenshot audit): this used to only show a document COUNT,
  // with no way to actually see or open what had been uploaded — the
  // real fix is showing the same file list + Preview/Replace/Archive
  // the standalone Documents tab already has (DocumentCard), not just a
  // number. Fetched client-side (this step is inside a client-only
  // wizard) via the same tab-context RPC the standalone page uses
  // server-side, so the two stay consistent by construction.
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
    // refresh() is async and only calls setState after awaiting the RPC —
    // never synchronously within this effect body — which is the actual
    // condition this rule exists to catch; this call just doesn't match
    // the unsafe shape it's pattern-matching against.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const checklistTypeIds = new Set((tab?.checklist ?? []).map((c) => c.document_type_id));
  const additionalDocuments = (tab?.documents ?? []).filter((doc) => !checklistTypeIds.has(doc.document_type_id));

  return (
    <div>
      <p className="mb-3 text-[12.5px] text-ink-muted">
        Upload the required documents below — each has its own slot, so there&apos;s no need to pick a type
        first. Anything else can go in &quot;Upload Another Document&quot; further down.
      </p>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {tab && (
        <div className="mb-4">
          <DocumentChecklist
            shipmentId={shipmentId}
            checklist={tab.checklist}
            canEdit={tab.can_upload}
            canVerify={tab.can_verify}
            onChanged={refresh}
          />
        </div>
      )}

      {additionalDocuments.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-ink">Additional Documents</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {additionalDocuments.map((doc) => (
              <DocumentCard
                key={doc.document_id}
                shipmentId={shipmentId}
                documentId={doc.document_id}
                documentVersionId={doc.current_version.id}
                typeName={doc.document_type_name}
                filename={doc.current_version.original_filename}
                versionNumber={doc.current_version.version_number}
                status={doc.current_version.status}
                uploadedAt={doc.current_version.uploaded_at}
                uploadedByName={doc.current_version.uploaded_by_name ?? "Unknown"}
                storagePath={doc.current_version.storage_path}
                canEdit={tab?.can_upload ?? false}
                canVerify={tab?.can_verify ?? false}
                onChanged={refresh}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mb-2">
        <h3 className="mb-1 text-sm font-semibold text-ink">Upload Another Document</h3>
        <p className="mb-2 text-xs text-ink-muted">For anything not on the required checklist above.</p>
      </div>
      <DocumentUploadForm shipmentId={shipmentId} documentTypes={documentTypes} onUploaded={refresh} />

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
