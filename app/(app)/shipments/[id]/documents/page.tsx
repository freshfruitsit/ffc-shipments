import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DocumentUploadForm } from "@/components/shipments/tabs/document-upload-form";
import { DocumentCard } from "@/components/shipments/tabs/document-card";
import { getDocumentTypes } from "@/lib/data/master-data";

export default async function DocumentsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: shipment, error } = await supabase.from("shipments").select("overall_status").eq("id", id).single();
  if (error || !shipment) notFound();

  const [{ data: documents }, documentTypes, { data: canUpload }] = await Promise.all([
    supabase.from("documents").select("*").eq("shipment_id", id),
    getDocumentTypes(),
    supabase.rpc("has_permission", { p_permission: "upload_docs" }),
  ]);

  const documentIds = (documents ?? []).map((d) => d.id);
  const { data: allVersions } = documentIds.length
    ? await supabase.from("document_versions").select("*").in("document_id", documentIds).eq("is_current", true)
    : { data: [] };

  const uploaderIds = [...new Set((allVersions ?? []).map((v) => v.uploaded_by).filter((u): u is string => !!u))];
  const { data: uploaders } = uploaderIds.length
    ? await supabase.from("v_assignable_profiles").select("id, full_name").in("id", uploaderIds)
    : { data: [] };
  const nameById = new Map((uploaders ?? []).map((u) => [u.id, u.full_name]));

  const typeNameById = new Map(documentTypes.map((t) => [t.id, t.name]));
  const versionByDocumentId = new Map((allVersions ?? []).map((v) => [v.document_id, v]));

  const canAdd = !!canUpload && shipment.overall_status !== "Completed";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(!documents || documents.length === 0) && (
          <p className="col-span-full rounded-lg border border-dashed border-border bg-surface-muted/40 p-6 text-center text-sm text-ink-muted">
            No documents uploaded yet.
          </p>
        )}
        {documents?.map((doc) => {
          const current = versionByDocumentId.get(doc.id);
          if (!current) return null;
          return (
            <DocumentCard
              key={doc.id}
              shipmentId={id}
              documentId={doc.id}
              typeName={typeNameById.get(doc.document_type_id) ?? "Document"}
              filename={current.original_filename}
              versionNumber={current.version_number}
              status={current.status}
              uploadedAt={current.uploaded_at}
              uploadedByName={current.uploaded_by ? nameById.get(current.uploaded_by) ?? "Unknown" : "Unknown"}
              storagePath={current.storage_path}
              canEdit={canAdd}
            />
          );
        })}
      </div>

      {canAdd && <DocumentUploadForm shipmentId={id} documentTypes={documentTypes} />}
      {!canAdd && (
        <p className="text-xs text-ink-muted">
          You don&apos;t have permission to upload documents, or this shipment is Completed.
        </p>
      )}
    </div>
  );
}
