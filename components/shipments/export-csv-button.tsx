"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Loader2 } from "lucide-react";
import { exportShipmentsCsvAction } from "@/lib/actions/export";
import type { OverallStatus } from "@/lib/types/database";

export function ExportCsvButton() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    const result = await exportShipmentsCsvAction({
      q: searchParams.get("q") ?? undefined,
      status: (searchParams.get("status") as OverallStatus) ?? undefined,
      view: searchParams.get("view") ?? undefined,
    });
    setLoading(false);

    if (result.csv) {
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ffc-shipments-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3.5 py-2 text-sm font-medium text-ink transition hover:bg-surface-muted disabled:opacity-60"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      Export CSV
    </button>
  );
}
