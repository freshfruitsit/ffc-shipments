import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TransportForm } from "@/components/shipments/tabs/transport-form";

export default async function TransportTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: shipment, error } = await supabase
    .from("shipments")
    .select("awb, airline_id, flight, eta, port_id, freight_agent_id, clearing_agent_id, packages, net_weight, gross_weight, transport_remarks, overall_status")
    .eq("id", id)
    .single();
  if (error || !shipment) notFound();

  const [{ data: airlines }, { data: ports }, { data: freightAgents }, { data: clearingAgents }, { data: canEdit }] =
    await Promise.all([
      supabase.from("airlines").select("id, name").eq("is_active", true).order("name"),
      supabase.from("ports").select("id, name").eq("is_active", true).order("display_order"),
      supabase.from("freight_agents").select("id, name").eq("is_active", true).order("name"),
      supabase.from("clearing_agents").select("id, name").eq("is_active", true).order("name"),
      supabase.rpc("has_permission", { p_permission: "edit_transport" }),
    ]);

  return (
    <TransportForm
      shipmentId={id}
      shipment={shipment}
      airlines={airlines ?? []}
      ports={ports ?? []}
      freightAgents={freightAgents ?? []}
      clearingAgents={clearingAgents ?? []}
      readOnly={!canEdit || shipment.overall_status === "Completed"}
    />
  );
}
