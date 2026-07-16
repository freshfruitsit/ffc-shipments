"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { exportReportCsvAction, exportSupplierPerformanceCsvAction, exportExceptionsCsvAction } from "@/lib/actions/reports";

function download(csv: string, filenamePrefix: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ExportButtonShell({ loading, error, onClick }: { loading: boolean; error: string | null; onClick: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onClick}
        disabled={loading}
        className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3.5 py-2 text-sm font-medium text-ink transition hover:bg-surface-muted disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Export CSV
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

export function ReportExportButton({ reportKey }: { reportKey: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setLoading(true);
    setError(null);
    const result = await exportReportCsvAction(reportKey);
    setLoading(false);
    if (result.error) return setError(result.error);
    if (result.csv) download(result.csv, `ffc-${reportKey}`);
  }

  return <ExportButtonShell loading={loading} error={error} onClick={handleExport} />;
}

export function SupplierPerformanceExportButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setLoading(true);
    setError(null);
    const result = await exportSupplierPerformanceCsvAction();
    setLoading(false);
    if (result.error) return setError(result.error);
    if (result.csv) download(result.csv, "ffc-supplier-performance");
  }

  return <ExportButtonShell loading={loading} error={error} onClick={handleExport} />;
}

export function ExceptionsExportButton({ status, severity }: { status?: string; severity?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setLoading(true);
    setError(null);
    const result = await exportExceptionsCsvAction({ status, severity });
    setLoading(false);
    if (result.error) return setError(result.error);
    if (result.csv) download(result.csv, "ffc-exceptions");
  }

  return <ExportButtonShell loading={loading} error={error} onClick={handleExport} />;
}
