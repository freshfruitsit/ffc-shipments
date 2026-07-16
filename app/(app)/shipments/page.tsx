import type { OverallStatus } from "@/lib/types/database";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { RegisterFilterBar } from "@/components/shipments/register-filter-bar";
import { SavedViewPills } from "@/components/shipments/saved-view-pills";
import { ExportCsvButton } from "@/components/shipments/export-csv-button";
import { formatDubaiDate } from "@/lib/dates";
import { STATUS_SEVERITY, SAVED_VIEWS } from "@/lib/prototype-constants";

const PAGE_SIZE = 25;
const VALID_STATUSES: OverallStatus[] = [
  "Draft", "Documents Pending", "Ready for Submission", "Submitted", "Customs Processing",
  "Clearance Pending", "Ready for Collection", "Received", "Completed", "On Hold", "Rejected",
  "Resubmission Required", "Cancelled",
];
const VALID_VIEWS: Set<string> = new Set(SAVED_VIEWS.map((v) => v.key));

export default async function ShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; view?: string; page?: string }>;
}) {
  const { q, status, view, page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const validStatus = status && (VALID_STATUSES as string[]).includes(status) ? (status as OverallStatus) : null;
  const validView = view && VALID_VIEWS.has(view) ? view : "all";

  const supabase = await createClient();

  const { data: canCreate } = await supabase.rpc("has_permission", { p_permission: "create_draft" });

  const { data: results, error } = await supabase.rpc("search_shipments", {
    p_query: q || null,
    p_status: validStatus,
    p_view: validView,
    p_page: page,
    p_page_size: PAGE_SIZE,
  });

  const totalCount = results?.[0]?.total_count ?? 0;
  const totalPages = totalCount ? Math.max(1, Math.ceil(Number(totalCount) / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Shipment Register</h1>
          <p className="text-sm text-ink-muted">Centralized register — replaces the manual Excel worksheet</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton />
          {canCreate && (
            <Link
              href="/shipments/new"
              className="flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-white transition hover:bg-primary-dark"
            >
              + New Shipment
            </Link>
          )}
        </div>
      </div>

      <SavedViewPills />
      <RegisterFilterBar />
      <p className="text-xs text-ink-muted">{totalCount} shipment(s) found</p>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="text-sm" style={{ minWidth: "1300px", width: "100%" }}>
            <thead>
              <tr className="border-b border-border bg-surface-muted text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                <th className="whitespace-nowrap px-4 py-2.5">Shipment ID</th>
                <th className="whitespace-nowrap px-4 py-2.5">Shipment Date</th>
                <th className="whitespace-nowrap px-4 py-2.5">Overall Status</th>
                <th className="whitespace-nowrap px-4 py-2.5">Supplier</th>
                <th className="whitespace-nowrap px-4 py-2.5">Origin Country</th>
                <th className="whitespace-nowrap px-4 py-2.5">ETA</th>
                <th className="whitespace-nowrap px-4 py-2.5">Arrival Port</th>
                <th className="whitespace-nowrap px-4 py-2.5">Customs Status</th>
                <th className="whitespace-nowrap px-4 py-2.5">Municipality Status</th>
                <th className="whitespace-nowrap px-4 py-2.5">Delivery Order Status</th>
                <th className="whitespace-nowrap px-4 py-2.5">MOFAIC Status</th>
                <th className="whitespace-nowrap px-4 py-2.5">Physical Document Status</th>
              </tr>
            </thead>
            <tbody>
              {error && (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-sm text-danger">
                    Couldn&apos;t load the shipment register right now. Try refreshing — if this keeps
                    happening, contact FFC IT.
                  </td>
                </tr>
              )}
              {!error && results?.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-10 text-center text-sm text-ink-muted">
                    No shipments match this view yet.
                  </td>
                </tr>
              )}
              {results?.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-primary-light/40">
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <Link href={`/shipments/${s.id}/overview`} className="font-medium text-primary-dark hover:underline">
                      {s.ref}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-ink-muted">{formatDubaiDate(s.shipment_date)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <StatusBadge status={s.overall_status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink">{s.supplier_name_snapshot}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">{s.origin_country ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-ink-muted">{s.eta ? formatDubaiDate(s.eta) : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">{s.port ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <StatusBadge status={s.customs_status} criticalList={[...STATUS_SEVERITY.customs.critical]} warnList={[...STATUS_SEVERITY.customs.warn]} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <StatusBadge status={s.municipality_status} criticalList={[...STATUS_SEVERITY.municipality.critical]} warnList={[...STATUS_SEVERITY.municipality.warn]} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <StatusBadge status={s.delivery_order_status} criticalList={[...STATUS_SEVERITY.deliveryOrder.critical]} warnList={[...STATUS_SEVERITY.deliveryOrder.warn]} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <StatusBadge status={s.mofaic_status} criticalList={[...STATUS_SEVERITY.mofaic.critical]} warnList={[...STATUS_SEVERITY.mofaic.warn]} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <StatusBadge status={s.physical_doc_status} criticalList={[...STATUS_SEVERITY.physicalDoc.critical]} warnList={[...STATUS_SEVERITY.physicalDoc.warn]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-ink-muted">
            <span>
              Page {page} of {totalPages} · {totalCount} total
            </span>
            <div className="flex gap-2">
              <PageLink page={page - 1} disabled={page <= 1} searchParams={{ q, status: validStatus ?? undefined, view: validView }}>
                Previous
              </PageLink>
              <PageLink page={page + 1} disabled={page >= totalPages} searchParams={{ q, status: validStatus ?? undefined, view: validView }}>
                Next
              </PageLink>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PageLink({
  page,
  disabled,
  searchParams,
  children,
}: {
  page: number;
  disabled: boolean;
  searchParams: { q?: string; status?: string; view?: string };
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  if (searchParams.q) params.set("q", searchParams.q);
  if (searchParams.status) params.set("status", searchParams.status);
  if (searchParams.view) params.set("view", searchParams.view);
  params.set("page", String(page));

  if (disabled) {
    return <span className="rounded-md border border-border px-3 py-1.5 text-ink-muted/50">{children}</span>;
  }
  return (
    <Link href={`/shipments?${params.toString()}`} className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-muted">
      {children}
    </Link>
  );
}
