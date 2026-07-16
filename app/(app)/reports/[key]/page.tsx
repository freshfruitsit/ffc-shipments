import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspacePagination } from "@/components/shipments/workspace-pagination";
import { ReportExportButton } from "@/components/shipments/report-export-buttons";
import { formatDubaiDate } from "@/lib/dates";
import { SHIPMENT_REPORTS, type ShipmentReportKey } from "@/lib/report-catalog";

const PAGE_SIZE = 50;

function fmtMoney(value: number | null, currency: string | null) {
  if (value == null) return "—";
  return `${currency ?? ""} ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
}

export default async function ReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { key } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const definition = SHIPMENT_REPORTS.find((r) => r.key === key);
  if (!definition) notFound();

  const supabase = await createClient();
  const { data: results, error } = await supabase.rpc("get_report_shipments", {
    p_report_key: key as ShipmentReportKey,
    p_page: page,
    p_page_size: PAGE_SIZE,
  });

  const totalCount = results?.[0]?.total_count ?? 0;
  const totalPages = totalCount ? Math.max(1, Math.ceil(Number(totalCount) / PAGE_SIZE)) : 1;
  const showWeights = key === "weight_variance";
  const showMofaicAging = key === "mofaic_pending";

  return (
    <div className="space-y-4">
      <div>
        <Link href="/reports" className="text-xs text-ink-muted hover:underline">
          ← All reports
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-ink">{definition.title}</h1>
        <p className="text-sm text-ink-muted">{definition.description}</p>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-muted">{totalCount} shipment(s)</p>
        <ReportExportButton reportKey={key} />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2.5">Shipment ID</th>
                <th className="px-4 py-2.5">Supplier</th>
                <th className="px-4 py-2.5">Origin</th>
                <th className="px-4 py-2.5">Overall Status</th>
                <th className="px-4 py-2.5">ETA</th>
                {showWeights ? (
                  <>
                    <th className="px-4 py-2.5">Net Weight</th>
                    <th className="px-4 py-2.5">Gross Weight</th>
                    <th className="px-4 py-2.5">Variance</th>
                  </>
                ) : showMofaicAging ? (
                  <>
                    <th className="px-4 py-2.5">MOFAIC Due</th>
                    <th className="px-4 py-2.5">Days Left</th>
                  </>
                ) : (
                  <th className="px-4 py-2.5">Invoice Value</th>
                )}
              </tr>
            </thead>
            <tbody>
              {error && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-danger">
                    Couldn&apos;t load this report right now. Try refreshing — if this keeps happening,
                    contact FFC IT.
                  </td>
                </tr>
              )}
              {!error && results?.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-ink-muted">
                    No shipments match this report right now.
                  </td>
                </tr>
              )}
              {results?.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-primary-light/40">
                  <td className="px-4 py-2.5">
                    <Link href={`/shipments/${s.id}/overview`} className="font-medium text-primary-dark hover:underline">
                      {s.ref}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-ink">{s.supplier_name_snapshot}</td>
                  <td className="px-4 py-2.5 text-ink-muted">{s.origin_country ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={s.overall_status} />
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-ink-muted">
                    {s.eta ? formatDubaiDate(s.eta) : "—"}
                  </td>
                  {showWeights ? (
                    <>
                      <td className="px-4 py-2.5 tabular-nums text-ink-muted">{s.net_weight ?? "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums text-ink-muted">{s.gross_weight ?? "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums text-ink-muted">
                        {s.net_weight != null && s.gross_weight != null
                          ? (Number(s.gross_weight) - Number(s.net_weight)).toFixed(2)
                          : "—"}
                      </td>
                    </>
                  ) : showMofaicAging ? (
                    <>
                      <td className="px-4 py-2.5 tabular-nums text-ink-muted">
                        {s.mofaic_due_date ? formatDubaiDate(s.mofaic_due_date) : "—"}
                      </td>
                      <td className={`px-4 py-2.5 tabular-nums font-medium ${
                        s.mofaic_days_left != null && s.mofaic_days_left < 0 ? "text-danger" : "text-ink"
                      }`}>
                        {s.mofaic_days_left ?? "—"}
                      </td>
                    </>
                  ) : (
                    <td className="px-4 py-2.5 tabular-nums text-ink-muted">
                      {fmtMoney(s.invoice_value, s.currency_code)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <WorkspacePagination page={page} totalPages={totalPages} totalCount={totalCount} basePath={`/reports/${key}`} />
    </div>
  );
}
