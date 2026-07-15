import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { InfoGrid, InfoItem, TabCard } from "@/components/ui/form";
import { DeliveryOrderUpdateModal } from "@/components/shipments/tabs/delivery-order-update-modal";
import { STATUS_SEVERITY } from "@/lib/prototype-constants";
import { getCarriers } from "@/lib/data/master-data";
import { getProfilesForPermission } from "@/lib/data/profiles-by-permission";
import { formatDubaiDate } from "@/lib/dates";

type DeliveryOrderData = {
  ref: string; carrier_id: string | null; carrier_name: string | null; delivery_order_status: string;
  delivery_order_requested_date: string | null; delivery_order_received_date: string | null;
  delivery_order_doc_uploaded: boolean; delivery_order_responsible: string | null; responsible_name: string | null;
  delivery_order_remarks: string | null; can_edit: boolean;
};

export default async function DeliveryOrderTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data, error }, carriers, eligibleProfiles] = await Promise.all([
    supabase.rpc("get_shipment_delivery_order_tab", { p_shipment_id: id }),
    getCarriers(),
    getProfilesForPermission(supabase, "edit_delivery_order"),
  ]);
  if (error) {
    console.error("[delivery-order-tab] get_shipment_delivery_order_tab failed:", error.message);
    throw new Error("Couldn't load the delivery order tab.");
  }
  if (!data) notFound();
  const shipment = data as unknown as DeliveryOrderData;

  return (
    <TabCard>
      <InfoGrid>
        <InfoItem label="Carrier">{shipment.carrier_name ?? "—"}</InfoItem>
        <InfoItem label="Delivery Order Status">
          <StatusBadge status={shipment.delivery_order_status} criticalList={[...STATUS_SEVERITY.deliveryOrder.critical]} warnList={[...STATUS_SEVERITY.deliveryOrder.warn]} />
        </InfoItem>
        <InfoItem label="Received Date">{shipment.delivery_order_received_date ? formatDubaiDate(shipment.delivery_order_received_date) : "—"}</InfoItem>
        <InfoItem label="Document Uploaded">{shipment.delivery_order_doc_uploaded ? "Yes" : "No"}</InfoItem>
        <InfoItem label="Responsible">{shipment.responsible_name ?? "—"}</InfoItem>
      </InfoGrid>

      <h4 className="mt-3.5 text-[12.5px] text-ink-muted">Remarks</h4>
      <p className="text-[12.5px] text-ink">{shipment.delivery_order_remarks || "—"}</p>

      <div className="mt-4">
        {shipment.can_edit ? (
          <DeliveryOrderUpdateModal
            shipmentId={id}
            shipmentRef={shipment.ref}
            shipment={shipment}
            carriers={carriers}
            profiles={eligibleProfiles.map((p) => ({ id: p.id, name: p.full_name }))}
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
