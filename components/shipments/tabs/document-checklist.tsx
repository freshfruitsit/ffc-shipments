import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { ChecklistUploadSlot } from "@/components/shipments/tabs/checklist-upload-slot";
import { DocumentCard } from "@/components/shipments/tabs/document-card";

export type ChecklistItem = {
  document_type_id: string;
  document_type_name: string;
  fulfilled_document_id: string | null;
  fulfilled_version_id: string | null;
  status: string | null;
  filename: string | null;
  version_number: number | null;
  storage_path: string | null;
  uploaded_at: string | null;
  uploaded_by_name: string | null;
};

/**
 * Per direct request: replaces picking a document type from a dropdown
 * one file at a time with a checklist of the shipment's ACTUAL required
 * document types (from required_documents — category- and optionally
 * origin-country-specific), each with its own inline upload slot. A row
 * is either unfulfilled (shows an upload button) or fulfilled (shows the
 * real DocumentCard — Preview/Replace/Archive/Verify all still work
 * exactly as they do elsewhere, this is the same component, not a
 * simplified copy).
 */
export function DocumentChecklist({
  shipmentId, checklist, canEdit, canVerify, onChanged,
}: {
  shipmentId: string;
  checklist: ChecklistItem[];
  canEdit: boolean;
  canVerify: boolean;
  onChanged?: () => void;
}) {
  if (checklist.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-surface-muted/40 p-4 text-center text-sm text-ink-muted">
        No specific document types are required for this shipment&apos;s category — anything uploaded below
        will show up in the general document list.
      </p>
    );
  }

  const fulfilledCount = checklist.filter((c) => c.fulfilled_version_id).length;

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border bg-surface-muted px-4 py-2.5">
        <h3 className="text-sm font-semibold text-ink">Required Documents</h3>
        <span className="text-xs text-ink-muted">{fulfilledCount} / {checklist.length} uploaded</span>
      </div>
      <div className="divide-y divide-border">
        {checklist.map((item) => (
          <div key={item.document_type_id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <ChecklistIcon status={item.status} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{item.document_type_name}</p>
                {item.filename && (
                  <p className="truncate text-xs text-ink-muted">
                    {item.filename} · v{item.version_number}
                    {item.status && <span className="ml-1.5 font-semibold text-ink">· {item.status}</span>}
                  </p>
                )}
              </div>
            </div>

            <div className="shrink-0">
              {item.fulfilled_document_id && item.fulfilled_version_id && item.filename ? (
                canEdit || canVerify ? (
                  <CompactDocumentActions
                    shipmentId={shipmentId}
                    documentId={item.fulfilled_document_id}
                    documentVersionId={item.fulfilled_version_id}
                    typeName={item.document_type_name}
                    filename={item.filename}
                    versionNumber={item.version_number ?? 1}
                    status={item.status ?? "Uploaded"}
                    storagePath={item.storage_path ?? ""}
                    uploadedAt={item.uploaded_at ?? ""}
                    uploadedByName={item.uploaded_by_name ?? "Unknown"}
                    canEdit={canEdit}
                    canVerify={canVerify}
                    onChanged={onChanged}
                  />
                ) : null
              ) : (
                canEdit && <ChecklistUploadSlot shipmentId={shipmentId} documentTypeId={item.document_type_id} onUploaded={onChanged} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChecklistIcon({ status }: { status: string | null }) {
  if (status === "Verified") return <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />;
  if (status === "Rejected") return <XCircle className="h-5 w-5 shrink-0 text-danger" />;
  if (status === "Uploaded") return <CheckCircle2 className="h-5 w-5 shrink-0 text-warning" />;
  return <Circle className="h-5 w-5 shrink-0 text-ink-muted/40" />;
}

/**
 * Same DocumentCard used everywhere else in the app, just without its
 * own bordered container — the checklist row already provides that
 * framing, so this reuses the real component's logic (Preview signed
 * URLs, Replace via R2, Archive, Verify/Reject) rather than duplicating
 * any of it, wrapped to fit inline in a checklist row.
 */
function CompactDocumentActions(props: {
  shipmentId: string; documentId: string; documentVersionId: string; typeName: string; filename: string;
  versionNumber: number; status: string; storagePath: string; uploadedAt: string; uploadedByName: string;
  canEdit: boolean; canVerify: boolean; onChanged?: () => void;
}) {
  return (
    <div className="w-56 [&>div]:border-0 [&>div]:p-0">
      <DocumentCard
        shipmentId={props.shipmentId}
        documentId={props.documentId}
        documentVersionId={props.documentVersionId}
        typeName={props.typeName}
        filename={props.filename}
        versionNumber={props.versionNumber}
        status={props.status}
        uploadedAt={props.uploadedAt}
        uploadedByName={props.uploadedByName}
        storagePath={props.storagePath}
        canEdit={props.canEdit}
        canVerify={props.canVerify}
        onChanged={props.onChanged}
      />
    </div>
  );
}
