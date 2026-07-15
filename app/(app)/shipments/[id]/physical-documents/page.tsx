import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { InfoGrid, InfoItem, TabCard } from "@/components/ui/form";
import { PhysicalDocumentsUpdateModal } from "@/components/shipments/tabs/physical-documents-update-modal";
import { STATUS_SEVERITY } from "@/lib/prototype-constants";
import { getCourierCompanies } from "@/lib/data/master-data";
import { getProfilesForPermission } from "@/lib/data/profiles-by-permission";
import { formatDubaiDate } from "@/lib/dates";

type PhysicalDocsData = {
  ref: string; physical_doc_status: string; originals_required: boolean; originals_received: boolean;
  ready_for_dispatch: boolean; courier_company_id: string | null; courier_company_name: string | null;
  tracking_number: string | null; dispatch_date: string | null; delivered_date: string | null;
  pod_received: boolean; physical_docs_responsible: string | null; responsible_name: string | null;
  physical_docs_remarks: string | null; can_edit: boolean;
};

export default async function PhysicalDocumentsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data, error }, couriers, eligibleProfiles] = await Promise.all([
    supabase.rpc("get_shipment_physical_documents_tab", { p_shipment_id: id }),
    getCourierCompanies(),
    getProfilesForPermission(supabase, "edit_physical_docs"),
  ]);
  if (error) {
    console.error("[physical-documents-tab] get_shipment_physical_documents_tab failed:", error.message);
    throw new Error("Couldn't load the physical documents tab.");
  }
  if (!data) notFound();
  const shipment = data as unknown as PhysicalDocsData;

  return (
    <TabCard>
      <InfoGrid>
        <InfoItem label="Originals Required">{shipment.originals_required ? "Yes" : "No"}</InfoItem>
        <InfoItem label="Originals Received">{shipment.originals_received ? "Yes" : "No"}</InfoItem>
        <InfoItem label="Ready for Dispatch">{shipment.ready_for_dispatch ? "Yes" : "No"}</InfoItem>
        <InfoItem label="Courier Company">{shipment.courier_company_name ?? "—"}</InfoItem>
        <InfoItem label="Tracking Number">{shipment.tracking_number ?? "—"}</InfoItem>
        <InfoItem label="Dispatch Date">{shipment.dispatch_date ? formatDubaiDate(shipment.dispatch_date) : "—"}</InfoItem>
        <InfoItem label="Delivered Date">{shipment.delivered_date ? formatDubaiDate(shipment.delivered_date) : "—"}</InfoItem>
        <InfoItem label="Proof of Delivery">{shipment.pod_received ? "Received" : "Pending"}</InfoItem>
        <InfoItem label="Physical Doc Status">
          <StatusBadge status={shipment.physical_doc_status} criticalList={[...STATUS_SEVERITY.physicalDoc.critical]} warnList={[...STATUS_SEVERITY.physicalDoc.warn]} />
        </InfoItem>
      </InfoGrid>

      <h4 className="mt-3.5 text-[12.5px] text-ink-muted">Remarks</h4>
      <p className="text-[12.5px] text-ink">{shipment.physical_docs_remarks || "—"}</p>

      <div className="mt-4">
        {shipment.can_edit ? (
          <PhysicalDocumentsUpdateModal
            shipmentId={id}
            shipmentRef={shipment.ref}
            shipment={shipment}
            couriers={couriers}
            profiles={eligibleProfiles.map((p) => ({ id: p.id, name: p.full_name }))}
          />
        ) : (
          <p className="text-xs text-ink-muted">
            You don&apos;t have permission to edit physical document details, or this shipment is Completed.
          </p>
        )}
      </div>
    </TabCard>
  );
}
