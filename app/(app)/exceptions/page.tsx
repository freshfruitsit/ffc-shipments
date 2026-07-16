import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { ExceptionsFilterBar } from "@/components/shipments/exceptions-filter-bar";
import { WorkspacePagination } from "@/components/shipments/workspace-pagination";
import { ExceptionsExportButton } from "@/components/shipments/report-export-buttons";
import { formatDubaiDateTime } from "@/lib/dates";

const PAGE_SIZE = 25;

export default async function ExceptionsWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; severity?: string; page?: string }>;
}) {
  const { status, severity, page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const supabase = await createClient();
  const { data: results, error } = await supabase.rpc("search_exceptions", {
    p_status: status || null,
    p_severity: severity || null,
    p_page: page,
    p_page_size: PAGE_SIZE,
  });

  const totalCount = results?.[0]?.total_count ?? 0;
  const totalPages = totalCount ? Math.max(1, Math.ceil(Number(totalCount) / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Exceptions</h1>
        <p className="text-sm text-ink-muted">
          Every open exception across your branch&apos;s shipments, most severe first. Shows Open through
          Waiting-for-* statuses by default — pick Resolved or Closed above to look those up specifically.
        </p>
      </div>

      <ExceptionsFilterBar />
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-muted">{totalCount} exception(s)</p>
        <ExceptionsExportButton status={status} severity={severity} />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2.5">Shipment</th>
                <th className="px-4 py-2.5">Severity</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">Description</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Assigned To</th>
                <th className="px-4 py-2.5">Raised</th>
                <th className="px-4 py-2.5">Due Date</th>
                <th className="px-4 py-2.5">Resubmissions</th>
              </tr>
            </thead>
            <tbody>
              {error && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-danger">
                    Couldn&apos;t load the exceptions workspace right now. Try refreshing — if this keeps
                    happening, contact FFC IT.
                  </td>
                </tr>
              )}
              {!error && results?.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-ink-muted">
                    No exceptions match this filter.
                  </td>
                </tr>
              )}
              {results?.map((exc) => (
                <tr key={exc.id} className="border-b border-border last:border-0 hover:bg-primary-light/40">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/shipments/${exc.shipment_id}/exceptions`}
                      className="font-medium text-primary-dark hover:underline"
                    >
                      {exc.shipment_ref}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={exc.severity} priority />
                  </td>
                  <td className="px-4 py-2.5 text-ink">{exc.type_name}</td>
                  <td className="max-w-xs truncate px-4 py-2.5 text-ink-muted" title={exc.description}>
                    {exc.description}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge
                      status={exc.status}
                      criticalList={[]}
                      warnList={[
                        "Open", "Under Review", "Waiting for Supplier", "Waiting for Carrier",
                        "Waiting for Authority", "Waiting for Finance",
                      ]}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-ink-muted">{exc.assigned_to_name ?? "Unassigned"}</td>
                  <td className="px-4 py-2.5 text-xs text-ink-muted">{formatDubaiDateTime(exc.created_at)}</td>
                  <td className="px-4 py-2.5 tabular-nums text-ink-muted">{exc.due_date ?? "—"}</td>
                  <td className="px-4 py-2.5 tabular-nums text-ink-muted">
                    {exc.resubmission_count > 0 ? exc.resubmission_count : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <WorkspacePagination
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        basePath="/exceptions"
        extraParams={{ status, severity }}
      />
    </div>
  );
}
