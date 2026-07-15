import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MofaicForm } from "@/components/shipments/tabs/mofaic-form";

export default async function MofaicTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: shipment, error } = await supabase
    .from("shipments")
    .select("mofaic_status, mofaic_ref, mofaic_payment_amount, mofaic_currency, mofaic_payment_date, mofaic_remarks, overall_status")
    .eq("id", id)
    .single();
  if (error || !shipment) notFound();

  const [{ data: currencies }, { data: canEdit }] = await Promise.all([
    supabase.from("currencies").select("code").eq("is_active", true).order("code"),
    supabase.rpc("has_permission", { p_permission: "edit_mofaic" }),
  ]);

  return (
    <MofaicForm
      shipmentId={id}
      shipment={shipment}
      currencies={(currencies ?? []).map((c) => c.code)}
      readOnly={!canEdit || shipment.overall_status === "Completed"}
    />
  );
}
