import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InfoGrid, InfoItem, TabCard } from "@/components/ui/form";
import { TransportUpdateModal } from "@/components/shipments/tabs/transport-update-modal";
import { getAirlines, getPorts, getFreightAgents, getClearingAgents } from "@/lib/data/master-data";
import { formatDubaiDateTime } from "@/lib/dates";

export default async function TransportTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: shipment, error }, airlines, ports, freightAgents, clearingAgents, { data: canEdit }] =
    await Promise.all([
      supabase
        .from("shipments")
        .select("ref, awb, airline_id, flight, eta, port_id, freight_agent_id, clearing_agent_id, packages, net_weight, gross_weight, transport_remarks, overall_status")
        .eq("id", id)
        .single(),
      getAirlines(),
      getPorts(),
      getFreightAgents(),
      getClearingAgents(),
      supabase.rpc("has_permission", { p_permission: "edit_transport" }),
    ]);
  if (error || !shipment) notFound();

  const airlineName = airlines.find((a) => a.id === shipment.airline_id)?.name ?? "—";
  const portName = ports.find((p) => p.id === shipment.port_id)?.name ?? "—";
  const clearingAgentName = clearingAgents.find((a) => a.id === shipment.clearing_agent_id)?.name ?? "—";
  const canAct = !!canEdit && shipment.overall_status !== "Completed";

  return (
    <TabCard>
      <InfoGrid>
        <InfoItem label="AWB Number">{shipment.awb ?? "—"}</InfoItem>
        <InfoItem label="Airline">{airlineName}</InfoItem>
        <InfoItem label="Flight Number">{shipment.flight ?? "—"}</InfoItem>
        <InfoItem label="ETA">{shipment.eta ? formatDubaiDateTime(shipment.eta) : "—"}</InfoItem>
        <InfoItem label="Arrival Port">{portName}</InfoItem>
        <InfoItem label="Packages">{shipment.packages ?? "—"}</InfoItem>
        <InfoItem label="Net Weight">{shipment.net_weight ? `${shipment.net_weight} kg` : "—"}</InfoItem>
        <InfoItem label="Gross Weight">{shipment.gross_weight ? `${shipment.gross_weight} kg` : "—"}</InfoItem>
        <InfoItem label="Clearing Agent">{clearingAgentName}</InfoItem>
      </InfoGrid>

      <h4 className="mt-3.5 text-[12.5px] text-ink-muted">Transport Remarks</h4>
      <p className="text-[12.5px] text-ink">{shipment.transport_remarks || "—"}</p>

      <div className="mt-4">
        {canAct ? (
          <TransportUpdateModal
            shipmentId={id}
            shipmentRef={shipment.ref}
            shipment={shipment}
            airlines={airlines}
            ports={ports}
            freightAgents={freightAgents}
            clearingAgents={clearingAgents}
          />
        ) : (
          <p className="text-xs text-ink-muted">
            You don&apos;t have permission to edit transport details, or this shipment is Completed.
          </p>
        )}
      </div>
    </TabCard>
  );
}
