import Link from "next/link";

/**
 * Shared pager for the workspace pages (Customs, Delivery Orders, MOFAIC,
 * Physical Documents, Documents, Exceptions). Kept as a plain link-based
 * component (not client-side state) so each page stays a Server Component —
 * consistent with how the main Shipment Register already paginates.
 */
export function WorkspacePagination({
  page,
  totalPages,
  totalCount,
  basePath,
  extraParams,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  basePath: string;
  extraParams?: Record<string, string | undefined>;
}) {
  function hrefFor(p: number) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams ?? {})) {
      if (v) params.set(k, v);
    }
    params.set("page", String(p));
    return `${basePath}?${params.toString()}`;
  }

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-2.5 text-xs text-ink-muted">
      <span>
        Page {page} of {totalPages} · {totalCount} total
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-muted">
            Previous
          </Link>
        ) : (
          <span className="rounded-md border border-border px-3 py-1.5 text-ink-muted/50">Previous</span>
        )}
        {page < totalPages ? (
          <Link href={hrefFor(page + 1)} className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-muted">
            Next
          </Link>
        ) : (
          <span className="rounded-md border border-border px-3 py-1.5 text-ink-muted/50">Next</span>
        )}
      </div>
    </div>
  );
}
