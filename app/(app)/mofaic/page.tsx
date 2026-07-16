import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspacePagination } from "@/components/shipments/workspace-pagination";
import { formatDubaiDate } from "@/lib/dates";
import { STATUS_SEVERITY } from "@/lib/prototype-constants";

const PAGE_SIZE = 25;

function fmtMoney(value: number | null, currency: string | null) {
  if (value == null) return "—";
  return `${currency ?? ""} ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
}

/**
 * Uses get_report_shipments('mofaic_pending', …) rather than
 * search_shipments — the whole point of this workspace is the aging
 * calculation (due date = delivery_order_received_date + payment window,
 * per mofaic_rules), and that RPC is the one that already computes it
 * (same formula as the per-shipment MOFAIC tab).
 */
export default async function MofaicWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const supabase = await createClient();
  const { data: results, error } = await supabase.rpc("get_report_shipments", {
    p_report_key: "mofaic_pending",
    p_page: page,
    p_page_size: PAGE_SIZE,
  });

  const totalCount = results?.[0]?.total_count ?? 0;
  const totalPages = totalCount ? Math.max(1, Math.ceil(Number(totalCount) / PAGE_SIZE)) : 1;
  const overdueCount = results?.filter((r) => r.mofaic_days_left != null && r.mofaic_days_left < 0).length ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">MOFAIC Follow-up</h1>
        <p className="text-sm text-ink-muted">
          Payment due {`\u2014`} days remaining are counted from the delivery-order-received date, per the
          configured payment window.
        </p>
      </div>

      <div className="flex gap-3">
        <div className="rounded-lg border border-border bg-surface px-4 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-ink-muted">Pending / Payment Due / Overdue</p>
          <p className="text-lg font-semibold text-ink">{totalCount}</p>
        </div>
        {overdueCount > 0 && (
          <div className="rounded-lg border border-danger/30 bg-danger-light px-4 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-danger">Overdue on this page</p>
            <p className="text-lg font-semibold text-danger">{overdueCount}</p>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2.5">Shipment ID</th>
                <th className="px-4 py-2.5">Supplier</th>
                <th className="px-4 py-2.5">MOFAIC Status</th>
                <th className="px-4 py-2.5">Payment Due</th>
                <th className="px-4 py-2.5">Days Left</th>
                <th className="px-4 py-2.5">Invoice Value</th>
              </tr>
            </thead>
            <tbody>
              {error && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-danger">
                    Couldn&apos;t load the MOFAIC workspace right now. Try refreshing — if this keeps
                    happening, contact FFC IT.
                  </td>
                </tr>
              )}
              {!error && results?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-ink-muted">
                    No MOFAIC payments are pending right now.
                  </td>
                </tr>
              )}
              {results?.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-primary-light/40">
                  <td className="px-4 py-2.5">
                    <Link href={`/shipments/${s.id}/mofaic`} className="font-medium text-primary-dark hover:underline">
                      {s.ref}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-ink">{s.supplier_name_snapshot}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge
                      status={s.mofaic_status}
                      criticalList={[...STATUS_SEVERITY.mofaic.critical]}
                      warnList={[...STATUS_SEVERITY.mofaic.warn]}
                    />
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-ink-muted">
                    {s.mofaic_due_date ? formatDubaiDate(s.mofaic_due_date) : "—"}
                  </td>
                  <td className={`px-4 py-2.5 tabular-nums font-medium ${
                    s.mofaic_days_left != null && s.mofaic_days_left < 0 ? "text-danger" : "text-ink"
                  }`}>
                    {s.mofaic_days_left == null
                      ? "—"
                      : s.mofaic_days_left < 0
                        ? `${Math.abs(s.mofaic_days_left)} day(s) overdue`
                        : `${s.mofaic_days_left} day(s) left`}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-ink-muted">
                    {fmtMoney(s.invoice_value, s.currency_code)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <WorkspacePagination page={page} totalPages={totalPages} totalCount={totalCount} basePath="/mofaic" />
    </div>
  );
}
