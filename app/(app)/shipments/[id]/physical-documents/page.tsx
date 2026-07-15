import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { InfoGrid, InfoItem, TabCard } from "@/components/ui/form";
import { PhysicalDocumentsUpdateModal } from "@/components/shipments/tabs/physical-documents-update-modal";
import { STATUS_SEVERITY } from "@/lib/prototype-constants";
import { getCourierCompanies } from "@/lib/data/master-data";
import { formatDubaiDate } from "@/lib/dates";

export default async function PhysicalDocumentsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: shipment, error }, couriers, { data: profiles }, { data: canEdit }] = await Promise.all([
    supabase
      .from("shipments")
      .select("ref, physical_doc_status, originals_required, originals_received, ready_for_dispatch, courier_company_id, tracking_number, dispatch_date, delivered_date, pod_received, physical_docs_responsible, physical_docs_remarks, overall_status")
      .eq("id", id)
      .single(),
    getCourierCompanies(),
    supabase.from("v_assignable_profiles").select("id, full_name").order("full_name"),
    supabase.rpc("has_permission", { p_permission: "edit_physical_docs" }),
  ]);
  if (error || !shipment) notFound();

  const courierName = couriers.find((c) => c.id === shipment.courier_company_id)?.name ?? "—";
  const canAct = !!canEdit && shipment.overall_status !== "Completed";

  return (
    <TabCard>
      <InfoGrid>
        <InfoItem label="Originals Required">{shipment.originals_required ? "Yes" : "No"}</InfoItem>
        <InfoItem label="Originals Received">{shipment.originals_received ? "Yes" : "No"}</InfoItem>
        <InfoItem label="Ready for Dispatch">{shipment.ready_for_dispatch ? "Yes" : "No"}</InfoItem>
        <InfoItem label="Courier Company">{courierName}</InfoItem>
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
        {canAct ? (
          <PhysicalDocumentsUpdateModal
            shipmentId={id}
            shipmentRef={shipment.ref}
            shipment={shipment}
            couriers={couriers}
            profiles={(profiles ?? []).map((p) => ({ id: p.id, name: p.full_name }))}
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
