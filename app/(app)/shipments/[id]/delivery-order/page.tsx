import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { InfoGrid, InfoItem, TabCard } from "@/components/ui/form";
import { DeliveryOrderUpdateModal } from "@/components/shipments/tabs/delivery-order-update-modal";
import { STATUS_SEVERITY } from "@/lib/prototype-constants";
import { getCarriers } from "@/lib/data/master-data";
import { formatDubaiDate } from "@/lib/dates";

export default async function DeliveryOrderTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: shipment, error }, carriers, { data: profiles }, { data: canEdit }] = await Promise.all([
    supabase
      .from("shipments")
      .select("ref, carrier_id, delivery_order_status, delivery_order_requested_date, delivery_order_received_date, delivery_order_doc_uploaded, delivery_order_responsible, delivery_order_remarks, overall_status")
      .eq("id", id)
      .single(),
    getCarriers(),
    supabase.from("v_assignable_profiles").select("id, full_name").order("full_name"),
    supabase.rpc("has_permission", { p_permission: "edit_delivery_order" }),
  ]);
  if (error || !shipment) notFound();

  const carrierName = carriers.find((c) => c.id === shipment.carrier_id)?.name ?? "—";
  const responsibleName = profiles?.find((p) => p.id === shipment.delivery_order_responsible)?.full_name ?? "—";
  const canAct = !!canEdit && shipment.overall_status !== "Completed";

  return (
    <TabCard>
      <InfoGrid>
        <InfoItem label="Carrier">{carrierName}</InfoItem>
        <InfoItem label="Delivery Order Status">
          <StatusBadge status={shipment.delivery_order_status} criticalList={[...STATUS_SEVERITY.deliveryOrder.critical]} warnList={[...STATUS_SEVERITY.deliveryOrder.warn]} />
        </InfoItem>
        <InfoItem label="Received Date">{shipment.delivery_order_received_date ? formatDubaiDate(shipment.delivery_order_received_date) : "—"}</InfoItem>
        <InfoItem label="Document Uploaded">{shipment.delivery_order_doc_uploaded ? "Yes" : "No"}</InfoItem>
        <InfoItem label="Responsible">{responsibleName}</InfoItem>
      </InfoGrid>

      <h4 className="mt-3.5 text-[12.5px] text-ink-muted">Remarks</h4>
      <p className="text-[12.5px] text-ink">{shipment.delivery_order_remarks || "—"}</p>

      <div className="mt-4">
        {canAct ? (
          <DeliveryOrderUpdateModal
            shipmentId={id}
            shipmentRef={shipment.ref}
            shipment={shipment}
            carriers={carriers}
            profiles={(profiles ?? []).map((p) => ({ id: p.id, name: p.full_name }))}
          />
        ) : (
          <p className="text-xs text-ink-muted">
            You don&apos;t have permission to edit delivery order details, or this shipment is Completed.
          </p>
        )}
      </div>
    </TabCard>
  );
}
