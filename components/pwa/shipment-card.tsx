import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDubaiDate } from "@/lib/dates";

export type ShipmentCardData = {
  id: string;
  ref: string;
  supplier_name_snapshot: string;
  overall_status: string;
  eta: string | null;
  port: string | null;
};

/**
 * Left-edge color bar signals urgency at a glance before any text is even
 * read — deliberately borrowed from the desktop register's own severity
 * concept (STATUS_SEVERITY), so someone who already knows the desktop app
 * doesn't have to relearn a second color language on their phone.
 */
export function ShipmentCard({ shipment }: { shipment: ShipmentCardData }) {
  const urgent = ["Rejected", "Resubmission Required", "On Hold", "Cancelled"].includes(shipment.overall_status);
  const attention = ["Clearance Pending", "Customs Processing", "Documents Pending"].includes(shipment.overall_status);

  return (
    <Link
      href={`/m/shipments/${shipment.id}`}
      className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 active:bg-surface-muted"
    >
      <span
        className="h-10 w-1 shrink-0 rounded-full"
        style={{
          background: urgent ? "var(--color-danger)" : attention ? "var(--color-pwa-amber)" : "var(--color-primary)",
        }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[13px] font-medium text-ink">{shipment.ref}</p>
        <p className="truncate text-[12.5px] text-ink-muted">{shipment.supplier_name_snapshot}</p>
        <div className="mt-1 flex items-center gap-2">
          <StatusBadge status={shipment.overall_status} />
          {shipment.eta && <span className="text-[11px] text-ink-muted">ETA {formatDubaiDate(shipment.eta)}</span>}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted/50" />
    </Link>
  );
}
