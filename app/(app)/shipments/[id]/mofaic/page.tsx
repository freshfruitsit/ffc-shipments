import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MofaicForm } from "@/components/shipments/tabs/mofaic-form";
import { getCurrencies } from "@/lib/data/master-data";

export default async function MofaicTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: shipment, error }, currencies, { data: canEdit }] = await Promise.all([
    supabase
      .from("shipments")
      .select("mofaic_status, mofaic_ref, mofaic_payment_amount, mofaic_currency, mofaic_payment_date, mofaic_remarks, overall_status")
      .eq("id", id)
      .single(),
    getCurrencies(),
    supabase.rpc("has_permission", { p_permission: "edit_mofaic" }),
  ]);
  if (error || !shipment) notFound();

  return (
    <MofaicForm
      shipmentId={id}
      shipment={shipment}
      currencies={currencies}
      readOnly={!canEdit || shipment.overall_status === "Completed"}
    />
  );
}
