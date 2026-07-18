import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InfoGrid, InfoItem, TabCard } from "@/components/ui/form";
import { TransportUpdateModal } from "@/components/shipments/tabs/transport-update-modal";
import { getAirlines, getPorts, getFreightAgents, getClearingAgents } from "@/lib/data/master-data";
import { formatDubaiDateTime } from "@/lib/dates";

type TransportData = {
  ref: string; awb: string | null; airline_id: string | null; airline_name: string | null; flight: string | null;
  flight_status: string; transit_airport: string | null;
  eta: string | null; port_id: string | null; port_name: string | null;
  freight_agent_id: string | null; freight_agent_name: string | null;
  clearing_agent_id: string | null; clearing_agent_name: string | null;
  packages: number | null; net_weight: number | null; gross_weight: number | null;
  transport_remarks: string | null; can_edit: boolean;
};

export default async function TransportTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data, error }, airlines, ports, freightAgents, clearingAgents] = await Promise.all([
    supabase.rpc("get_shipment_transport_tab", { p_shipment_id: id }),
    getAirlines(), getPorts(), getFreightAgents(), getClearingAgents(),
  ]);
  if (error) {
    console.error("[transport-tab] get_shipment_transport_tab failed:", error.message);
    throw new Error("Couldn't load the transport tab.");
  }
  if (!data) notFound();
  const shipment = data as unknown as TransportData;

  return (
    <TabCard>
      <InfoGrid>
        <InfoItem label="AWB Number">{shipment.awb ?? "—"}</InfoItem>
        <InfoItem label="Airline">{shipment.airline_name ?? "—"}</InfoItem>
        <InfoItem label="Flight Number">{shipment.flight ?? "—"}</InfoItem>
        <InfoItem label="Flight Status">{shipment.flight_status}</InfoItem>
        {shipment.flight_status === "In Transit" && (
          <InfoItem label="Transit Airport">{shipment.transit_airport ?? "—"}</InfoItem>
        )}
        <InfoItem label="ETA">{shipment.eta ? formatDubaiDateTime(shipment.eta) : "—"}</InfoItem>
        <InfoItem label="Arrival Port">{shipment.port_name ?? "—"}</InfoItem>
        <InfoItem label="Packages">{shipment.packages ?? "—"}</InfoItem>
        <InfoItem label="Net Weight">{shipment.net_weight ? `${shipment.net_weight} kg` : "—"}</InfoItem>
        <InfoItem label="Gross Weight">{shipment.gross_weight ? `${shipment.gross_weight} kg` : "—"}</InfoItem>
        <InfoItem label="Clearing Agent">{shipment.clearing_agent_name ?? "—"}</InfoItem>
      </InfoGrid>

      <h4 className="mt-3.5 text-[12.5px] text-ink-muted">Transport Remarks</h4>
      <p className="text-[12.5px] text-ink">{shipment.transport_remarks || "—"}</p>

      <div className="mt-4">
        {shipment.can_edit ? (
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
