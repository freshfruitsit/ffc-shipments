import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DocumentCard } from "@/components/shipments/tabs/document-card";
import { SingleDocumentUpload } from "@/components/shipments/tabs/single-document-upload";
import { getDocumentTypes } from "@/lib/data/master-data";

type DocumentsData = {
  documents: {
    document_id: string; document_type_id: string; document_type_name: string; invoice_no: string | null; version_count: number;
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

  // Per direct request: one shipment, one combined document, one Verify
  // tick — not a per-type checklist. Most recently uploaded document (if
  // any) is what's shown; the upload slot only appears when nothing has
  // been uploaded yet, so there's never a path to a second file here.
  const document = tab.documents[0] ?? null;
  const shipmentDocsType = documentTypes.find((t) => t.name === "Shipment Documents");

  return (
    <div className="space-y-4">
      {document ? (
        <div className="max-w-sm">
          <DocumentCard
            shipmentId={id}
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
          />
        </div>
      ) : tab.can_upload && shipmentDocsType ? (
        <SingleDocumentUpload shipmentId={id} documentTypeId={shipmentDocsType.id} />
      ) : (
        <p className="rounded-lg border border-dashed border-border bg-surface-muted/40 p-6 text-center text-sm text-ink-muted">
          {tab.can_upload ? "Document upload isn't configured for this system yet." : "No document uploaded, and you don't have permission to upload one."}
        </p>
      )}
    </div>
  );
}
