import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDubaiDate } from "@/lib/dates";
import { STATUS_SEVERITY } from "@/lib/prototype-constants";

export type WorkspaceShipmentRow = {
  id: string;
  ref: string;
  supplier_name_snapshot: string;
  origin_country: string | null;
  awb: string | null;
  eta: string | null;
  overall_status: string;
  document_status: string;
  customs_status: string;
  municipality_status: string;
  delivery_order_status: string;
  mofaic_status: string;
  physical_doc_status: string;
};

type FocusColumn = keyof typeof STATUS_SEVERITY;

const FOCUS_LABEL: Record<FocusColumn, string> = {
  document: "Document Status",
  customs: "Customs Status",
  municipality: "Municipality Status",
  deliveryOrder: "Delivery Order Status",
  mofaic: "MOFAIC Status",
  physicalDoc: "Physical Doc Status",
};

const FOCUS_FIELD: Record<FocusColumn, keyof WorkspaceShipmentRow> = {
  document: "document_status",
  customs: "customs_status",
  municipality: "municipality_status",
  deliveryOrder: "delivery_order_status",
  mofaic: "mofaic_status",
  physicalDoc: "physical_doc_status",
};

const FOCUS_TAB: Record<FocusColumn, string> = {
  document: "documents",
  customs: "customs",
  municipality: "municipality",
  deliveryOrder: "delivery-order",
  mofaic: "mofaic",
  physicalDoc: "physical-documents",
};

/**
 * Shared table for the cross-shipment workspace pages (Customs, Delivery
 * Orders, MOFAIC, Physical Documents, Documents). Each page fixes a single
 * `focus` sub-process column rather than repeating the full 14-column
 * register — the point of a workspace page is "everything pending in THIS
 * process", so that column deserves prominence, not competition with the
 * other seven.
 */
export function WorkspaceTable({
  results,
  error,
  focus,
  emptyMessage,
}: {
  results: WorkspaceShipmentRow[] | null | undefined;
  error: boolean;
  focus: FocusColumn;
  emptyMessage: string;
}) {
  const focusField = FOCUS_FIELD[focus];
  const focusSeverity = STATUS_SEVERITY[focus];
  const focusTab = FOCUS_TAB[focus];

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2.5">Shipment ID</th>
              <th className="px-4 py-2.5">Supplier</th>
              <th className="px-4 py-2.5">ETA</th>
              <th className="px-4 py-2.5">Overall Status</th>
              <th className="px-4 py-2.5">{FOCUS_LABEL[focus]}</th>
            </tr>
          </thead>
          <tbody>
            {error && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-danger">
                  Couldn&apos;t load this workspace right now. Try refreshing — if this keeps happening,
                  contact FFC IT.
                </td>
              </tr>
            )}
            {!error && results?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-ink-muted">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {results?.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0 hover:bg-primary-light/40">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/shipments/${s.id}/${focusTab}`}
                    className="font-medium text-primary-dark hover:underline"
                  >
                    {s.ref}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-ink">{s.supplier_name_snapshot}</td>
                <td className="px-4 py-2.5 tabular-nums text-ink-muted">
                  {s.eta ? formatDubaiDate(s.eta) : "—"}
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={s.overall_status} />
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge
                    status={String(s[focusField])}
                    criticalList={[...focusSeverity.critical]}
                    warnList={[...focusSeverity.warn]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
