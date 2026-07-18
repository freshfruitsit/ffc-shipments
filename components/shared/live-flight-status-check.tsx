"use client";

import { useState } from "react";
import { Loader2, PlaneTakeoff, RefreshCw } from "lucide-react";
import { checkLiveFlightStatusAction, applySuggestedFlightStatusAction, type LiveFlightStatus } from "@/lib/actions/flight-status";
import type { FlightStatus } from "@/lib/types/database";

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AE", { timeZone: "Asia/Dubai", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function LiveFlightStatusCheck({
  shipmentId,
  flightNumber,
  onApplied,
}: {
  shipmentId: string;
  flightNumber: string | null;
  onApplied?: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<LiveFlightStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  async function handleCheck() {
    setChecking(true);
    setError(null);
    setResult(null);
    setApplied(false);
    const res = await checkLiveFlightStatusAction(flightNumber ?? "");
    setChecking(false);
    if (res.error) setError(res.error);
    else if (res.data) setResult(res.data);
  }

  async function handleApply(status: FlightStatus) {
    setApplying(true);
    const res = await applySuggestedFlightStatusAction(shipmentId, status);
    setApplying(false);
    if (res.error) setError(res.error);
    else {
      setApplied(true);
      if (onApplied) onApplied();
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PlaneTakeoff className="h-4 w-4 text-primary-dark" />
          <span className="text-[13px] font-semibold text-ink">Live flight status</span>
        </div>
        <button
          onClick={handleCheck}
          disabled={checking || !flightNumber}
          className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-muted disabled:opacity-50"
        >
          {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {checking ? "Checking…" : "Check now"}
        </button>
      </div>

      {!flightNumber && <p className="mt-2 text-xs text-ink-muted">Add a flight number first to check its live status.</p>}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      {result && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-ink-muted">Reported status</span>
            <span className="font-medium capitalize text-ink">{result.raw_status}</span>
          </div>
          {result.airline_name && (
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-ink-muted">Airline</span>
              <span className="font-medium text-ink">{result.airline_name}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-ink-muted">Departure</span>
            <span className="font-medium text-ink">
              {formatTime(result.departure_actual ?? result.departure_estimated ?? result.departure_scheduled)}
              {result.departure_delay_minutes !== null && result.departure_delay_minutes > 0 && (
                <span className="ml-1 text-warning">(+{result.departure_delay_minutes}m)</span>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-ink-muted">Arrival</span>
            <span className="font-medium text-ink">
              {formatTime(result.arrival_actual ?? result.arrival_estimated ?? result.arrival_scheduled)}
              {result.arrival_delay_minutes !== null && result.arrival_delay_minutes > 0 && (
                <span className="ml-1 text-warning">(+{result.arrival_delay_minutes}m)</span>
              )}
            </span>
          </div>

          {applied ? (
            <p className="rounded-md bg-primary-light px-3 py-2 text-center text-xs font-medium text-primary-dark">
              Flight status updated.
            </p>
          ) : result.suggested_status ? (
            <button
              onClick={() => handleApply(result.suggested_status!)}
              disabled={applying}
              className="w-full rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-dark disabled:opacity-60"
            >
              {applying ? "Applying…" : `Set flight status to "${result.suggested_status}"`}
            </button>
          ) : (
            <p className="text-xs text-ink-muted">
              This status ({result.raw_status}) needs your own judgment — it isn&apos;t auto-suggested here.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
