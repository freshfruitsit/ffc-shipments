import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PhysicalDocumentsForm } from "@/components/shipments/tabs/physical-documents-form";

export default async function PhysicalDocumentsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: shipment, error } = await supabase
    .from("shipments")
    .select("physical_doc_status, originals_required, originals_received, ready_for_dispatch, courier_company_id, tracking_number, dispatch_date, delivered_date, pod_received, physical_docs_remarks, overall_status")
    .eq("id", id)
    .single();
  if (error || !shipment) notFound();

  const [{ data: couriers }, { data: canEdit }] = await Promise.all([
    supabase.from("courier_companies").select("id, name").eq("is_active", true).order("name"),
    supabase.rpc("has_permission", { p_permission: "edit_physical_docs" }),
  ]);

  return (
    <PhysicalDocumentsForm
      shipmentId={id}
      shipment={shipment}
      couriers={couriers ?? []}
      readOnly={!canEdit || shipment.overall_status === "Completed"}
    />
  );
}
