import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DocumentUploadForm } from "@/components/shipments/tabs/document-upload-form";
import { DocumentDownloadLink } from "@/components/shipments/tabs/document-download-link";
import { formatDubaiDateTime } from "@/lib/dates";
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

  const typeNameById = new Map((documentTypes ?? []).map((t) => [t.id, t.name]));
  const versionByDocumentId = new Map((allVersions ?? []).map((v) => [v.document_id, v]));

  const canAdd = !!canUpload && shipment.overall_status !== "Completed";

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">File</th>
              <th className="px-4 py-3">Version</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Uploaded</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {(!documents || documents.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-ink-muted">
                  No documents uploaded yet.
                </td>
              </tr>
            )}
            {documents?.map((doc) => {
              const current = versionByDocumentId.get(doc.id);
              if (!current) return null;
              return (
                <tr key={doc.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-ink">{typeNameById.get(doc.document_type_id) ?? "—"}</td>
                  <td className="px-4 py-3 text-ink">{current.original_filename}</td>
                  <td className="px-4 py-3 tabular-nums text-ink-muted">v{current.version_number}</td>
                  <td className="px-4 py-3 text-ink-muted">{current.status}</td>
                  <td className="px-4 py-3 tabular-nums text-ink-muted">{formatDubaiDateTime(current.uploaded_at)}</td>
                  <td className="px-4 py-3">
                    <DocumentDownloadLink storagePath={current.storage_path} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canAdd && <DocumentUploadForm shipmentId={id} documentTypes={documentTypes ?? []} />}
      {!canAdd && (
        <p className="text-xs text-ink-muted">
          You don&apos;t have permission to upload documents, or this shipment is Completed.
        </p>
      )}
    </div>
  );
}
