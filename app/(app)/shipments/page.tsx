import type { OverallStatus } from "@/lib/types/database";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { RegisterFilterBar } from "@/components/shipments/register-filter-bar";
import { formatDubaiDate } from "@/lib/dates";

const PAGE_SIZE = 25;
const VALID_STATUSES: OverallStatus[] = [
  "Draft", "Documents Pending", "Ready for Submission", "Submitted", "Customs Processing",
  "Clearance Pending", "Ready for Collection", "Received", "Completed", "On Hold", "Rejected",
  "Resubmission Required", "Cancelled",
];

export default async function ShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { q, status, page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  // Item 6 fix: validate the status URL param against the controlled enum
  // list before it ever reaches a query — an unrecognized value is quietly
  // ignored (treated as "no filter") rather than passed through.
  const validStatus = status && (VALID_STATUSES as string[]).includes(status) ? (status as OverallStatus) : null;

  const supabase = await createClient();

  const { data: canCreate } = await supabase.rpc("has_permission", { p_permission: "create_draft" });

  // Item 6 fix: search_shipments is a real parameterized RPC — no raw
  // PostgREST `.or()` string built from user input, so a crafted search
  // term containing filter-syntax characters (commas, dots, percent signs)
  // is just a literal substring to match, never an injected extra filter.
  const { data: results, error } = await supabase.rpc("search_shipments", {
    p_query: q || null,
    p_status: validStatus,
    p_page: page,
    p_page_size: PAGE_SIZE,
  });

  const totalCount = results?.[0]?.total_count ?? 0;
  const totalPages = totalCount ? Math.max(1, Math.ceil(Number(totalCount) / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Shipment Register</h1>
          <p className="text-sm text-ink-muted">
            {totalCount} shipment{totalCount === 1 ? "" : "s"}
            {validStatus ? ` · ${validStatus}` : ""}
            {q ? ` · matching "${q}"` : ""}
          </p>
        </div>
      </div>

      <RegisterFilterBar canCreate={!!canCreate} />

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">AWB</th>
                <th className="px-4 py-3">ETA</th>
                <th className="px-4 py-3">Overall Status</th>
                <th className="px-4 py-3">Customs</th>
                <th className="px-4 py-3">Municipality</th>
                <th className="px-4 py-3">Delivery Order</th>
                <th className="px-4 py-3">MOFAIC</th>
              </tr>
            </thead>
            <tbody>
              {error && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-danger">
                    Couldn&apos;t load the shipment register right now. Try refreshing — if this keeps
                    happening, contact FFC IT.
                  </td>
                </tr>
              )}
              {!error && results?.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-ink-muted">
                    No shipments match these filters yet.
                  </td>
                </tr>
              )}
              {results?.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-surface-muted/60">
                  <td className="px-4 py-3">
                    <Link href={`/shipments/${s.id}`} className="font-medium text-primary-dark hover:underline">
                      {s.ref}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink">{s.supplier_name_snapshot}</td>
                  <td className="px-4 py-3 tabular-nums text-ink-muted">{s.awb ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums text-ink-muted">{formatDubaiDate(s.eta)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.overall_status} />
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{s.customs_status}</td>
                  <td className="px-4 py-3 text-ink-muted">{s.municipality_status}</td>
                  <td className="px-4 py-3 text-ink-muted">{s.delivery_order_status}</td>
                  <td className="px-4 py-3 text-ink-muted">{s.mofaic_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-ink-muted">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <PageLink page={page - 1} disabled={page <= 1} searchParams={{ q, status: validStatus ?? undefined }}>
              Previous
            </PageLink>
            <PageLink page={page + 1} disabled={page >= totalPages} searchParams={{ q, status: validStatus ?? undefined }}>
              Next
            </PageLink>
          </div>
        </div>
      )}
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
  searchParams: { q?: string; status?: string };
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  if (searchParams.q) params.set("q", searchParams.q);
  if (searchParams.status) params.set("status", searchParams.status);
  params.set("page", String(page));

  if (disabled) {
    return (
      <span className="rounded-md border border-border px-3 py-1.5 text-ink-muted/50">{children}</span>
    );
  }
  return (
    <Link href={`/shipments?${params.toString()}`} className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-muted">
      {children}
    </Link>
  );
}
