import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DocumentUploadForm } from "@/components/shipments/tabs/document-upload-form";
import { DocumentCard } from "@/components/shipments/tabs/document-card";
import { DocumentChecklist, type ChecklistItem } from "@/components/shipments/tabs/document-checklist";
import { getDocumentTypes } from "@/lib/data/master-data";

type DocumentsData = {
  documents: {
    document_id: string; document_type_id: string; document_type_name: string; invoice_no: string | null; version_count: number;
    current_version: {
      id: string; version_number: number; status: string; storage_path: string; original_filename: string;
      uploaded_at: string; uploaded_by_name: string | null; verified_by_name: string | null; expiry_date: string | null;
    };
  }[];
  checklist: ChecklistItem[];
  can_upload: boolean;
  can_verify: boolean;
};

export default async function DocumentsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data, error }, documentTypes] = await Promise.all([
    supabase.rpc("get_shipment_documents_tab", { p_shipment_id: id }),
    getDocumentTypes(),
  ]);
  if (error) {
    console.error("[documents-tab] get_shipment_documents_tab failed:", error.message);
    throw new Error("Couldn't load the documents tab.");
  }
  if (!data) notFound();
  const tab = data as unknown as DocumentsData;

  // Anything uploaded under a type that ISN'T part of the required
  // checklist (e.g. "Other", or a type this category doesn't require)
  // still needs to be visible — just separately, since the checklist
  // above already accounts for every required type.
  const checklistTypeIds = new Set(tab.checklist.map((c) => c.document_type_id));
  const additionalDocuments = tab.documents.filter((doc) => !checklistTypeIds.has(doc.document_type_id));

  return (
    <div className="space-y-5">
      <DocumentChecklist
        shipmentId={id}
        checklist={tab.checklist}
        canEdit={tab.can_upload}
        canVerify={tab.can_verify}
      />

      {additionalDocuments.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Additional Documents</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {additionalDocuments.map((doc) => (
              <DocumentCard
                key={doc.document_id}
                shipmentId={id}
                documentId={doc.document_id}
                documentVersionId={doc.current_version.id}
                typeName={doc.document_type_name}
                filename={doc.current_version.original_filename}
                versionNumber={doc.current_version.version_number}
                status={doc.current_version.status}
                uploadedAt={doc.current_version.uploaded_at}
                uploadedByName={doc.current_version.uploaded_by_name ?? "Unknown"}
                storagePath={doc.current_version.storage_path}
                canEdit={tab.can_upload}
                canVerify={tab.can_verify}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">Upload Another Document</h3>
        <p className="mb-2 text-xs text-ink-muted">
          For anything not on the required checklist above — e.g. correspondence, extra supplier
          paperwork, or a document type this category doesn&apos;t require.
        </p>
        {tab.can_upload && <DocumentUploadForm shipmentId={id} documentTypes={documentTypes} />}
        {!tab.can_upload && (
          <p className="text-xs text-ink-muted">
            You don&apos;t have permission to upload documents, or this shipment is Completed.
          </p>
        )}
      </div>
    </div>
  );
}
