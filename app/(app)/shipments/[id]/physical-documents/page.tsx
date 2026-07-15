import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PhysicalDocumentsForm } from "@/components/shipments/tabs/physical-documents-form";
import { getCourierCompanies } from "@/lib/data/master-data";

export default async function PhysicalDocumentsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: shipment, error }, couriers, { data: canEdit }] = await Promise.all([
    supabase
      .from("shipments")
      .select("physical_doc_status, originals_required, originals_received, ready_for_dispatch, courier_company_id, tracking_number, dispatch_date, delivered_date, pod_received, physical_docs_remarks, overall_status")
      .eq("id", id)
      .single(),
    getCourierCompanies(),
    supabase.rpc("has_permission", { p_permission: "edit_physical_docs" }),
  ]);
  if (error || !shipment) notFound();

  return (
    <PhysicalDocumentsForm
      shipmentId={id}
      shipment={shipment}
      couriers={couriers}
      readOnly={!canEdit || shipment.overall_status === "Completed"}
    />
  );
}
