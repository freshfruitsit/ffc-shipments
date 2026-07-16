"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { readSheet } from "read-excel-file/browser";
import { parseMirsalSheetRows, type ParsedStagingRow } from "@/lib/import-parser";
import {
  createImportBatchAction, stageImportRowsChunkAction, validateImportBatchAction,
  setReconciliationExpectedAction, commitImportBatchChunkAction, getImportBatchStatusAction,
} from "@/lib/actions/import";

type Phase = "select" | "parsing" | "preview" | "staging" | "validating" | "review" | "reconciling" | "committing" | "done" | "error";

type BatchStatusIssue = { staging_row_id: number; issue_code: string; issue_message: string; severity: string; source_row_number: number };
type BatchStatusPayload = {
  batch: { id: string; status: string; total_rows: number; valid_rows: number; warning_rows: number; invalid_rows: number; reconciliation_passed: boolean | null; failure_reason: string | null };
  reconciliation: { month_label: string; expected_count: number; committed_count: number }[];
  issues: BatchStatusIssue[];
};

const STAGE_CHUNK_SIZE = 500;

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Option = { id: string; name: string };

export function ImportWizard({ branches, categories }: { branches: Option[]; categories: Option[] }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("select");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedStagingRow[]>([]);
  const [monthsDetected, setMonthsDetected] = useState<string[]>([]);
  const [skippedRowCount, setSkippedRowCount] = useState(0);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [status, setStatus] = useState<BatchStatusPayload | null>(null);
  const [expectedCounts, setExpectedCounts] = useState<Record<string, string>>({});
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");

  async function handleFileSelected(file: File) {
    setError(null);
    setFileName(file.name);
    setPhase("parsing");
    try {
      const sheetRows = await readSheet(file);
      const result = parseMirsalSheetRows(sheetRows as unknown[][]);
      if (result.rows.length === 0) {
        setError("No data rows were recognized in this file. Confirm it matches the expected Mirsal 2 layout.");
        setPhase("error");
        return;
      }
      setParsedRows(result.rows);
      setMonthsDetected(result.monthsDetected);
      setSkippedRowCount(result.skippedRowCount);
      setPhase("preview");
    } catch {
      setError("Couldn't read this file. Confirm it's a valid .xlsx workbook.");
      setPhase("error");
    }
  }

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  async function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    await handleFileSelected(file);
  }

  async function stageAndValidate() {
    if (!selectedFile) return;
    setPhase("staging");
    setProgress({ done: 0, total: parsedRows.length });
    setError(null);

    const hash = await sha256Hex(selectedFile);
    const batchResult = await createImportBatchAction(fileName, hash, STAGE_CHUNK_SIZE);
    if (batchResult.error || !batchResult.batchId) {
      setError(batchResult.error ?? "Couldn't create the import batch.");
      setPhase("error");
      return;
    }
    setBatchId(batchResult.batchId);

    for (let i = 0; i < parsedRows.length; i += STAGE_CHUNK_SIZE) {
      const chunk = parsedRows.slice(i, i + STAGE_CHUNK_SIZE);
      const result = await stageImportRowsChunkAction(batchResult.batchId, chunk);
      if (result.error) {
        setError(result.error);
        setPhase("error");
        return;
      }
      setProgress({ done: Math.min(i + STAGE_CHUNK_SIZE, parsedRows.length), total: parsedRows.length });
    }

    setPhase("validating");
    const validateResult = await validateImportBatchAction(batchResult.batchId);
    if (validateResult.error) {
      setError(validateResult.error);
      setPhase("error");
      return;
    }

    const statusResult = await getImportBatchStatusAction(batchResult.batchId);
    if (statusResult.error || !statusResult.data) {
      setError(statusResult.error ?? "Couldn't load the validation summary.");
      setPhase("error");
      return;
    }
    setStatus(statusResult.data as BatchStatusPayload);
    setPhase("review");
  }

  function handleExpectedCountChange(month: string, value: string) {
    setExpectedCounts((prev) => ({ ...prev, [month]: value }));
  }

  async function proceedToCommit() {
    if (!batchId) return;
    setPhase("reconciling");
    for (const month of monthsDetected) {
      const raw = expectedCounts[month];
      if (raw === undefined || raw.trim() === "") continue;
      const n = parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 0) continue;
      const result = await setReconciliationExpectedAction(batchId, month, n);
      if (result.error) {
        setError(result.error);
        setPhase("error");
        return;
      }
    }

    setPhase("committing");
    let remaining = 1;
    let committedSoFar = 0;
    let lastStatus = "";
    while (remaining > 0) {
      const result = await commitImportBatchChunkAction(batchId, branchId, categoryId);
      if (result.error) {
        setError(result.error);
        setPhase("error");
        return;
      }
      committedSoFar += result.committedThisChunk;
      remaining = result.remaining;
      lastStatus = result.batchStatus;
      setProgress({ done: committedSoFar, total: (status?.batch.valid_rows ?? 0) + (status?.batch.warning_rows ?? 0) });
    }

    const finalStatusResult = await getImportBatchStatusAction(batchId);
    if (finalStatusResult.data) setStatus(finalStatusResult.data as BatchStatusPayload);
    setPhase(lastStatus === "Committed" ? "done" : "done"); // Failed is still a terminal, informative state shown below
  }

  function resetWizard() {
    setPhase("select");
    setFileName("");
    setError(null);
    setParsedRows([]);
    setMonthsDetected([]);
    setBatchId(null);
    setStatus(null);
    setExpectedCounts({});
    setSelectedFile(null);
    router.refresh();
  }

  // ---------------- render ----------------

  if (phase === "select" || phase === "parsing") {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-ink-muted">Branch</span>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-ink-muted">Category</span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="rounded-lg border border-dashed border-border bg-surface p-10 text-center">
          <Upload className="mx-auto h-8 w-8 text-ink-muted" strokeWidth={1.5} />
          <p className="mt-3 text-sm font-medium text-ink">Upload the Mirsal 2 workbook (.xlsx)</p>
          <p className="mt-1 text-xs text-ink-muted">
            Parsed entirely in your browser — nothing is sent anywhere until you confirm the preview below.
            Every committed shipment in this batch uses the branch and category selected above.
          </p>
          <label className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">
            {phase === "parsing" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {phase === "parsing" ? "Reading file…" : "Choose file"}
            <input type="file" accept=".xlsx" className="hidden" onChange={handleInputChange} disabled={phase === "parsing"} />
          </label>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger-light p-6">
        <div className="flex items-center gap-2 text-danger">
          <XCircle className="h-5 w-5" />
          <p className="font-medium">Something went wrong</p>
        </div>
        <p className="mt-2 text-sm text-danger">{error}</p>
        <button onClick={resetWizard} className="mt-4 rounded-md border border-border bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-surface-muted">
          Start over
        </button>
      </div>
    );
  }

  if (phase === "preview") {
    return (
      <div className="space-y-4 rounded-lg border border-border bg-surface p-6">
        <div>
          <p className="text-sm font-medium text-ink">{fileName}</p>
          <p className="mt-1 text-xs text-ink-muted">
            {parsedRows.length} data row(s) recognized across {monthsDetected.length} month(s)
            {skippedRowCount > 0 ? `, ${skippedRowCount} row(s) skipped as non-data (separators/blank rows)` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {monthsDetected.map((m) => (
            <span key={m} className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-ink-muted">{m}</span>
          ))}
        </div>
        <p className="text-xs text-ink-muted">
          Nothing has been uploaded to the database yet. Confirming below stages these rows for validation —
          you can still review every row before anything is committed as a real shipment.
        </p>
        <div className="flex gap-2">
          <button onClick={stageAndValidate} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">
            Confirm &amp; stage for validation
          </button>
          <button onClick={resetWizard} className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted">
            Choose a different file
          </button>
        </div>
      </div>
    );
  }

  if (phase === "staging" || phase === "validating") {
    return (
      <div className="rounded-lg border border-border bg-surface p-10 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
        <p className="mt-3 text-sm text-ink">
          {phase === "staging" ? `Staging rows… ${progress.done} / ${progress.total}` : "Validating staged rows…"}
        </p>
      </div>
    );
  }

  if (phase === "review" && status) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border bg-surface p-4 text-center">
            <p className="text-2xl font-semibold text-primary-dark">{status.batch.valid_rows}</p>
            <p className="text-xs text-ink-muted">Valid</p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4 text-center">
            <p className="text-2xl font-semibold text-warning">{status.batch.warning_rows}</p>
            <p className="text-xs text-ink-muted">Warning (still committable)</p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4 text-center">
            <p className="text-2xl font-semibold text-danger">{status.batch.invalid_rows}</p>
            <p className="text-xs text-ink-muted">Invalid (will be skipped)</p>
          </div>
        </div>

        {status.issues.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className="border-b border-border bg-surface-muted px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Validation issues ({status.issues.length}{status.issues.length >= 500 ? ", showing first 500" : ""})
            </div>
            <div className="max-h-64 overflow-y-auto">
              {status.issues.map((issue, i) => (
                <div key={i} className="flex items-start gap-2 border-b border-border px-4 py-2 text-sm last:border-0">
                  {issue.severity === "Error" ? (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  )}
                  <span className="text-ink-muted">Row {issue.source_row_number}: {issue.issue_message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-sm font-medium text-ink">Expected row count per month (optional but recommended)</p>
          <p className="mt-1 text-xs text-ink-muted">
            Enter the count you already know from the source file for each month, if you have it. Committing
            will fail (and stop, without losing anything already committed) if the committed count doesn&apos;t
            match — that&apos;s the reconciliation check working as intended, not a bug.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {monthsDetected.map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm">
                <span className="w-28 shrink-0 text-ink-muted">{m}</span>
                <input
                  type="number"
                  min={0}
                  value={expectedCounts[m] ?? ""}
                  onChange={(e) => handleExpectedCountChange(m, e.target.value)}
                  className="w-20 rounded-md border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={proceedToCommit} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">
            Commit {status.batch.valid_rows + status.batch.warning_rows} valid/warning row(s)
          </button>
          <button onClick={resetWizard} className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (phase === "reconciling" || phase === "committing") {
    return (
      <div className="rounded-lg border border-border bg-surface p-10 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
        <p className="mt-3 text-sm text-ink">
          {phase === "reconciling" ? "Recording expected counts…" : `Committing shipments… ${progress.done} / ${progress.total}`}
        </p>
      </div>
    );
  }

  if (phase === "done" && status) {
    const succeeded = status.batch.status === "Committed";
    return (
      <div className={`rounded-lg border p-6 ${succeeded ? "border-primary/30 bg-primary-light/40" : "border-danger/30 bg-danger-light"}`}>
        <div className={`flex items-center gap-2 ${succeeded ? "text-primary-dark" : "text-danger"}`}>
          {succeeded ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
          <p className="font-medium">{succeeded ? "Import committed" : "Import stopped — reconciliation mismatch"}</p>
        </div>
        {!succeeded && status.batch.failure_reason && (
          <p className="mt-2 text-sm text-danger">{status.batch.failure_reason}</p>
        )}
        <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2">Month</th>
                <th className="px-4 py-2">Expected</th>
                <th className="px-4 py-2">Committed</th>
              </tr>
            </thead>
            <tbody>
              {status.reconciliation.map((r) => (
                <tr key={r.month_label} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-ink">{r.month_label}</td>
                  <td className="px-4 py-2 tabular-nums text-ink-muted">{r.expected_count}</td>
                  <td className={`px-4 py-2 tabular-nums ${r.committed_count === r.expected_count ? "text-ink-muted" : "font-medium text-danger"}`}>
                    {r.committed_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={resetWizard} className="mt-4 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted">
          Import another file
        </button>
      </div>
    );
  }

  return null;
}
