import { createClient } from "@/lib/supabase/server";
import { ImportWizard } from "@/components/import/import-wizard";
import { formatDubaiDateTime } from "@/lib/dates";

export default async function ImportPage() {
  const supabase = await createClient();

  const [{ data: branches }, { data: categories }, { data: batches, error: batchesError }] = await Promise.all([
    supabase.from("branches").select("id, name").eq("is_active", true).order("display_order"),
    supabase.from("shipment_categories").select("id, name").eq("is_active", true).order("display_order"),
    supabase.rpc("list_import_batches", { p_page: 1, p_page_size: 20 }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Historical Data Import</h1>
        <p className="text-sm text-ink-muted">
          Import the Mirsal 2 workbook. Every row is validated before anything is committed, and a
          reconciliation check against expected monthly counts runs before the batch is considered done.
        </p>
      </div>

      {!branches?.length || !categories?.length ? (
        <div className="rounded-lg border border-warning/30 bg-warning-light p-4 text-sm text-warning">
          No active branches or categories are configured yet — set those up in Master Data before importing.
        </div>
      ) : (
        <ImportWizard branches={branches} categories={categories} />
      )}

      <div>
        <h2 className="text-sm font-semibold text-ink">Past batches</h2>
        <div className="mt-2 overflow-hidden rounded-lg border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-muted text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-2.5">File</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Rows (valid/warning/invalid)</th>
                  <th className="px-4 py-2.5">Uploaded</th>
                  <th className="px-4 py-2.5">Reconciliation</th>
                </tr>
              </thead>
              <tbody>
                {batchesError && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-danger">
                      Couldn&apos;t load past batches right now.
                    </td>
                  </tr>
                )}
                {!batchesError && batches?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-ink-muted">
                      No import batches yet.
                    </td>
                  </tr>
                )}
                {batches?.map((b) => (
                  <tr key={b.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 text-ink">{b.file_name}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center whitespace-nowrap rounded-xl px-2.5 py-0.5 text-[10.5px] font-bold ${
                          b.status === "Committed"
                            ? "bg-primary-light text-primary-dark"
                            : b.status === "Failed"
                              ? "bg-danger-light text-danger"
                              : "bg-info-light text-info"
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-ink-muted">
                      {b.valid_rows ?? "—"} / {b.warning_rows ?? "—"} / {b.invalid_rows ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-ink-muted">{formatDubaiDateTime(b.uploaded_at)}</td>
                    <td className="px-4 py-2.5">
                      {b.reconciliation_passed == null ? (
                        <span className="text-ink-muted">—</span>
                      ) : b.reconciliation_passed ? (
                        <span className="text-primary-dark">Passed</span>
                      ) : (
                        <span className="text-danger" title={b.failure_reason ?? undefined}>Mismatch</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
