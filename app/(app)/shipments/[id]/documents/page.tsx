import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DocumentUploadForm } from "@/components/shipments/tabs/document-upload-form";
import { DocumentCard } from "@/components/shipments/tabs/document-card";
import { getDocumentTypes } from "@/lib/data/master-data";

type DocumentsData = {
  documents: {
    document_id: string; document_type_name: string; invoice_no: string | null; version_count: number;
    current_version: {
      id: string; version_number: number; status: string; storage_path: string; original_filename: string;
      uploaded_at: string; uploaded_by_name: string | null; verified_by_name: string | null; expiry_date: string | null;
    };
  }[];
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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tab.documents.length === 0 && (
          <p className="col-span-full rounded-lg border border-dashed border-border bg-surface-muted/40 p-6 text-center text-sm text-ink-muted">
            No documents uploaded yet.
          </p>
        )}
        {tab.documents.map((doc) => (
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

      {tab.can_upload && <DocumentUploadForm shipmentId={id} documentTypes={documentTypes} />}
      {!tab.can_upload && (
        <p className="text-xs text-ink-muted">
          You don&apos;t have permission to upload documents, or this shipment is Completed.
        </p>
      )}
    </div>
  );
}
