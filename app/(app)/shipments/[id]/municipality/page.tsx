import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MunicipalityForm } from "@/components/shipments/tabs/municipality-form";

export default async function MunicipalityTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: shipment, error } = await supabase
    .from("shipments")
    .select("municipality_draft_ref, municipality_submitted_ref, municipality_status, municipality_submission_date, municipality_completion_date, municipality_remarks, overall_status")
    .eq("id", id)
    .single();
  if (error || !shipment) notFound();

  const { data: canEdit } = await supabase.rpc("has_permission", { p_permission: "edit_customs" });

  return (
    <MunicipalityForm shipmentId={id} shipment={shipment} readOnly={!canEdit || shipment.overall_status === "Completed"} />
  );
}
