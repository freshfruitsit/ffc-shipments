import { createClient } from "@/lib/supabase/server";
import { RegisterFilterBar } from "@/components/shipments/register-filter-bar";
import { WorkspaceTable, type WorkspaceShipmentRow } from "@/components/shipments/workspace-table";
import { WorkspacePagination } from "@/components/shipments/workspace-pagination";

const PAGE_SIZE = 25;

export default async function DocumentsWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { q, status, page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const supabase = await createClient();
  const { data: results, error } = await supabase.rpc("search_shipments", {
    p_query: q || null,
    p_status: (status as never) || null,
    p_view: "missingdocs",
    p_page: page,
    p_page_size: PAGE_SIZE,
  });

  const totalCount = results?.[0]?.total_count ?? 0;
  const totalPages = totalCount ? Math.max(1, Math.ceil(Number(totalCount) / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Documents</h1>
        <p className="text-sm text-ink-muted">
          Shipments that don&apos;t yet have a complete, verified document set.
        </p>
      </div>

      <RegisterFilterBar />
      <p className="text-xs text-ink-muted">{totalCount} shipment(s) with incomplete documents</p>

      <WorkspaceTable
        results={results as WorkspaceShipmentRow[] | null}
        error={!!error}
        focus="document"
        emptyMessage="Every shipment's documents are complete and verified."
      />

      <WorkspacePagination
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        basePath="/documents"
        extraParams={{ q, status }}
      />
    </div>
  );
}
