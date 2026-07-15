import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DeliveryOrderForm } from "@/components/shipments/tabs/delivery-order-form";

export default async function DeliveryOrderTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: shipment, error } = await supabase
    .from("shipments")
    .select("carrier_id, delivery_order_status, delivery_order_requested_date, delivery_order_received_date, delivery_order_doc_uploaded, delivery_order_remarks, overall_status")
    .eq("id", id)
    .single();
  if (error || !shipment) notFound();

  const [{ data: carriers }, { data: canEdit }] = await Promise.all([
    supabase.from("carriers").select("id, name").eq("is_active", true).order("name"),
    supabase.rpc("has_permission", { p_permission: "edit_delivery_order" }),
  ]);

  return (
    <DeliveryOrderForm
      shipmentId={id}
      shipment={shipment}
      carriers={carriers ?? []}
      readOnly={!canEdit || shipment.overall_status === "Completed"}
    />
  );
}
