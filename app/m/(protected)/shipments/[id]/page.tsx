import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { FlightPathVisual } from "@/components/pwa/flight-path-visual";
import { LiveFlightStatusCheck } from "@/components/shared/live-flight-status-check";
import { STATUS_SEVERITY } from "@/lib/prototype-constants";
import { formatDubaiDate } from "@/lib/dates";

type HeaderContext = {
  id: string; ref: string; supplier_name_snapshot: string; overall_status: string;
  eta: string | null; awb: string | null; flight: string | null; priority: string;
  responsible_name: string | null; port_name: string | null;
};

type Statuses = {
  document_status: string; customs_status: string; municipality_status: string;
  delivery_order_status: string; mofaic_status: string; physical_doc_status: string;
};

export default async function MobileShipmentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: headerData, error: headerError }, { data: statusRow, error: statusError }] = await Promise.all([
    supabase.rpc("get_shipment_header_context", { p_shipment_id: id }),
    supabase
      .from("shipments")
      .select("document_status, customs_status, municipality_status, delivery_order_status, mofaic_status, physical_doc_status")
      .eq("id", id)
      .single(),
  ]);

  if (headerError || statusError) {
    console.error("[mobile-shipment-detail] failed:", headerError?.message, statusError?.message);
    throw new Error("Couldn't load this shipment.");
  }
  if (!headerData) notFound();

  const header = headerData as unknown as HeaderContext;
  const statuses = statusRow as Statuses;

  const statusRows: { label: string; value: string; severity: keyof typeof STATUS_SEVERITY }[] = [
    { label: "Documents", value: statuses.document_status, severity: "document" },
    { label: "Dubai Customs", value: statuses.customs_status, severity: "customs" },
    { label: "Dubai Municipality", value: statuses.municipality_status, severity: "municipality" },
    { label: "Delivery Order", value: statuses.delivery_order_status, severity: "deliveryOrder" },
    { label: "MOFAIC", value: statuses.mofaic_status, severity: "mofaic" },
    { label: "Physical Documents", value: statuses.physical_doc_status, severity: "physicalDoc" },
  ];

  return (
    <div className="px-4 pt-4 pb-8">
      <Link href="/m" className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-muted">
        <ChevronLeft className="h-4 w-4" /> Back
      </Link>

      <div className="mb-3">
        <p className="font-mono text-lg font-semibold text-ink">{header.ref}</p>
        <p className="text-[13px] text-ink-muted">{header.supplier_name_snapshot}</p>
      </div>

      <FlightPathVisual overallStatus={header.overall_status} />

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <InfoTile label="Overall Status"><StatusBadge status={header.overall_status} /></InfoTile>
        <InfoTile label="Priority"><StatusBadge status={header.priority} priority /></InfoTile>
        <InfoTile label="ETA" plain>{header.eta ? formatDubaiDate(header.eta) : "—"}</InfoTile>
        <InfoTile label="Port" plain>{header.port_name ?? "—"}</InfoTile>
        <InfoTile label="AWB / Flight" plain>{[header.awb, header.flight].filter(Boolean).join(" / ") || "—"}</InfoTile>
        <InfoTile label="Responsible" plain>{header.responsible_name ?? "Unassigned"}</InfoTile>
      </div>

      <div className="mt-4">
        <LiveFlightStatusCheck shipmentId={id} flightNumber={header.flight} />
      </div>

      <h2 className="mb-2 mt-5 font-display text-[13px] font-semibold text-ink">Module Status</h2>
      <p className="mb-2 text-[11px] text-ink-muted">
        Overall Status above updates automatically as these are updated — nothing to change manually.
      </p>
      <div className="space-y-1.5">
        {statusRows.map((row) => (
          <div key={row.label} className="flex items-center justify-between rounded-lg border border-border bg-surface px-3.5 py-2.5">
            <span className="text-[13px] text-ink">{row.label}</span>
            <StatusBadge
              status={row.value}
              criticalList={[...STATUS_SEVERITY[row.severity].critical]}
              warnList={[...STATUS_SEVERITY[row.severity].warn]}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function InfoTile({ label, children, plain }: { label: string; children: React.ReactNode; plain?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <p className="text-[10.5px] uppercase tracking-wide text-ink-muted">{label}</p>
      <div className={plain ? "mt-0.5 text-[13px] font-medium text-ink" : "mt-1"}>{children}</div>
    </div>
  );
}
