"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Loader2 } from "lucide-react";
import { exportShipmentsCsvAction } from "@/lib/actions/export";
import type { OverallStatus } from "@/lib/types/database";

export function ExportCsvButton() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setLoading(true);
    setError(null);
    const result = await exportShipmentsCsvAction({
      q: searchParams.get("q") ?? undefined,
      status: (searchParams.get("status") as OverallStatus) ?? undefined,
      view: searchParams.get("view") ?? undefined,
    });
    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (result.csv) {
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ffc-shipments-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }

    // Never silently truncate — if the real total exceeds the export
    // ceiling, say so explicitly rather than handing over a CSV that
    // looks complete but isn't.
    if (result.truncated) {
      setError(
        `Exported ${result.exportedCount} of ${result.totalCount} matching shipments — the export has a ${result.exportedCount?.toLocaleString()}-row limit. Narrow your filters to export the rest.`
      );
    }
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        onClick={handleExport}
        disabled={loading}
        className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3.5 py-2 text-sm font-medium text-ink transition hover:bg-surface-muted disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Export CSV
      </button>
      {error && <p className="max-w-xs text-right text-xs text-warning">{error}</p>}
    </div>
  );
}
