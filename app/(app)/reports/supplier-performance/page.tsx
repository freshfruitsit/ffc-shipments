import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { WorkspacePagination } from "@/components/shipments/workspace-pagination";
import { SupplierPerformanceExportButton } from "@/components/shipments/report-export-buttons";

const PAGE_SIZE = 50;

export default async function SupplierPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const supabase = await createClient();
  const { data: results, error } = await supabase.rpc("get_report_supplier_performance", {
    p_page: page,
    p_page_size: PAGE_SIZE,
  });

  const totalCount = results?.[0]?.total_count ?? 0;
  const totalPages = totalCount ? Math.max(1, Math.ceil(Number(totalCount) / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/reports" className="text-xs text-ink-muted hover:underline">
          ← All reports
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-ink">Supplier Performance Report</h1>
        <p className="text-sm text-ink-muted">
          Shipment volume, completion rate, and open exceptions, grouped by supplier — busiest first.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-muted">{totalCount} supplier(s)</p>
        <SupplierPerformanceExportButton />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2.5">Supplier</th>
                <th className="px-4 py-2.5">Total Shipments</th>
                <th className="px-4 py-2.5">Completed</th>
                <th className="px-4 py-2.5">Open Exceptions</th>
                <th className="px-4 py-2.5">Avg. Days to Complete</th>
              </tr>
            </thead>
            <tbody>
              {error && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-danger">
                    Couldn&apos;t load this report right now. Try refreshing — if this keeps happening,
                    contact FFC IT.
                  </td>
                </tr>
              )}
              {!error && results?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-ink-muted">
                    No supplier data yet.
                  </td>
                </tr>
              )}
              {results?.map((s) => (
                <tr key={s.supplier_name} className="border-b border-border last:border-0 hover:bg-primary-light/40">
                  <td className="px-4 py-2.5 font-medium text-ink">{s.supplier_name}</td>
                  <td className="px-4 py-2.5 tabular-nums text-ink-muted">{s.total_shipments}</td>
                  <td className="px-4 py-2.5 tabular-nums text-ink-muted">{s.completed_shipments}</td>
                  <td className={`px-4 py-2.5 tabular-nums ${s.open_exceptions > 0 ? "font-medium text-warning" : "text-ink-muted"}`}>
                    {s.open_exceptions}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-ink-muted">
                    {s.avg_days_to_complete != null ? `${s.avg_days_to_complete} day(s)` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <WorkspacePagination page={page} totalPages={totalPages} totalCount={totalCount} basePath="/reports/supplier-performance" />
    </div>
  );
}
