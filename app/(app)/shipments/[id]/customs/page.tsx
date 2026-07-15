import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CustomsForm } from "@/components/shipments/tabs/customs-form";

export default async function CustomsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: shipment, error } = await supabase
    .from("shipments")
    .select("declaration_no, customs_status, customs_submission_date, customs_result, customs_remarks, overall_status")
    .eq("id", id)
    .single();
  if (error || !shipment) notFound();

  const { data: canEdit } = await supabase.rpc("has_permission", { p_permission: "edit_customs" });

  return (
    <CustomsForm shipmentId={id} shipment={shipment} readOnly={!canEdit || shipment.overall_status === "Completed"} />
  );
}
