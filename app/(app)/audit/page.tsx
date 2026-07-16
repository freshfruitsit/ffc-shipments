import { createClient } from "@/lib/supabase/server";
import { AuditFilterBar } from "@/components/shipments/audit-filter-bar";
import { WorkspacePagination } from "@/components/shipments/workspace-pagination";
import { formatDubaiDateTime } from "@/lib/dates";

const PAGE_SIZE = 50;

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; module?: string; from?: string; to?: string; page?: string }>;
}) {
  const { q, module: moduleFilter, from, to, page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const supabase = await createClient();

  let query = supabase.from("audit_log").select("*", { count: "exact" }).order("occurred_at", { ascending: false });
  if (q) {
    query = query.or(`action.ilike.%${q}%,shipment_ref.ilike.%${q}%`);
  }
  if (moduleFilter) {
    query = query.eq("module", moduleFilter);
  }
  if (from) {
    query = query.gte("occurred_at", `${from}T00:00:00`);
  }
  if (to) {
    query = query.lte("occurred_at", `${to}T23:59:59`);
  }
  const { data: rows, error, count } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  // Resolve actor names in a second, small query rather than trying to type
  // an embedded FK select against a hand-maintained Database type — simpler
  // and just as correct for a page that's read-only and not perf-critical.
  const actorIds = [...new Set((rows ?? []).map((r) => r.actor).filter((a): a is string => !!a))];
  const actorNames = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", actorIds);
    for (const p of profiles ?? []) actorNames.set(p.id, p.full_name);
  }

  const totalCount = count ?? 0;
  const totalPages = totalCount ? Math.max(1, Math.ceil(totalCount / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Audit Log</h1>
        <p className="text-sm text-ink-muted">
          Every recorded system event — shipment-scoped rows are visible per your normal branch access,
          system-level rows (profiles, permissions, master data, imports) require the administer permission.
        </p>
      </div>

      <AuditFilterBar />
      <p className="text-xs text-ink-muted">{totalCount} event(s)</p>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2.5">Time</th>
                <th className="px-4 py-2.5">Actor</th>
                <th className="px-4 py-2.5">Action</th>
                <th className="px-4 py-2.5">Module</th>
                <th className="px-4 py-2.5">Shipment</th>
                <th className="px-4 py-2.5">Comment</th>
                <th className="px-4 py-2.5">Result</th>
              </tr>
            </thead>
            <tbody>
              {error && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-danger">
                    Couldn&apos;t load the audit log right now. Try refreshing — if this keeps happening,
                    contact FFC IT.
                  </td>
                </tr>
              )}
              {!error && rows?.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-ink-muted">
                    No events match this filter.
                  </td>
                </tr>
              )}
              {rows?.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-primary-light/40">
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-ink-muted">
                    {formatDubaiDateTime(r.occurred_at)}
                  </td>
                  <td className="px-4 py-2.5 text-ink-muted">
                    {r.actor ? (actorNames.get(r.actor) ?? "Unknown") : "System"}
                  </td>
                  <td className="px-4 py-2.5 text-ink">{r.action}</td>
                  <td className="px-4 py-2.5 text-ink-muted">{r.module}</td>
                  <td className="px-4 py-2.5 text-ink-muted">{r.shipment_ref ?? "—"}</td>
                  <td className="max-w-xs truncate px-4 py-2.5 text-ink-muted" title={r.comment ?? undefined}>
                    {r.comment ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center whitespace-nowrap rounded-xl px-2.5 py-0.5 text-[10.5px] font-bold ${
                        r.result === "Success" ? "bg-primary-light text-primary-dark" : "bg-danger-light text-danger"
                      }`}
                    >
                      {r.result ?? "Success"}
                    </span>
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
        basePath="/audit"
        extraParams={{ q, module: moduleFilter, from, to }}
      />
    </div>
  );
}
