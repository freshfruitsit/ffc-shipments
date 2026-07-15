import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TransportForm } from "@/components/shipments/tabs/transport-form";
import { getAirlines, getPorts, getFreightAgents, getClearingAgents } from "@/lib/data/master-data";

export default async function TransportTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: shipment, error }, airlines, ports, freightAgents, clearingAgents, { data: canEdit }] =
    await Promise.all([
      supabase
        .from("shipments")
        .select("awb, airline_id, flight, eta, port_id, freight_agent_id, clearing_agent_id, packages, net_weight, gross_weight, transport_remarks, overall_status")
        .eq("id", id)
        .single(),
      getAirlines(),
      getPorts(),
      getFreightAgents(),
      getClearingAgents(),
      supabase.rpc("has_permission", { p_permission: "edit_transport" }),
    ]);
  if (error || !shipment) notFound();

  return (
    <TransportForm
      shipmentId={id}
      shipment={shipment}
      airlines={airlines}
      ports={ports}
      freightAgents={freightAgents}
      clearingAgents={clearingAgents}
      readOnly={!canEdit || shipment.overall_status === "Completed"}
    />
  );
}
