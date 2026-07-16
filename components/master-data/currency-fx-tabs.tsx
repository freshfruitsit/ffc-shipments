"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { upsertCurrencyAction, upsertFxRateAction } from "@/lib/actions/master-data";

type CurrencyRow = { code: string; name: string; is_active: boolean };
type FxRateRow = { id: string; currency_code: string; effective_date: string; rate_to_aed: number; source: string };

export function CurrenciesTab({ rows, canEdit }: { rows: CurrencyRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSave() {
    setPending(true);
    setError(null);
    const result = await upsertCurrencyAction(code, name, isActive);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setAdding(false);
    setCode("");
    setName("");
    setIsActive(true);
    router.refresh();
  }

  async function handleToggle(currCode: string, currName: string, currActive: boolean) {
    await upsertCurrencyAction(currCode, currName, !currActive);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {canEdit && (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted"
        >
          <Plus className="h-4 w-4" /> Add / update currency
        </button>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      {adding && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-primary-light/20 p-3">
          <label className="text-xs text-ink-muted">
            Code
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={3} placeholder="AED"
              className="mt-0.5 block w-20 rounded-md border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>
          <label className="text-xs text-ink-muted">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="UAE Dirham"
              className="mt-0.5 block rounded-md border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-ink-muted">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active
          </label>
          <button onClick={handleSave} disabled={pending} className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-60">Save</button>
          <button onClick={() => setAdding(false)} className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-surface-muted">Cancel</button>
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Status</th>
              {canEdit && <th className="px-4 py-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-mono text-xs text-ink-muted">{r.code}</td>
                <td className="px-4 py-2 text-ink">{r.name}</td>
                <td className="px-4 py-2">
                  <span className={`inline-flex rounded-xl px-2 py-0.5 text-[10.5px] font-bold ${r.is_active ? "bg-primary-light text-primary-dark" : "bg-surface-muted text-ink-muted"}`}>
                    {r.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                {canEdit && (
                  <td className="px-4 py-2">
                    <button onClick={() => handleToggle(r.code, r.name, r.is_active)} className="text-xs font-medium text-primary-dark hover:underline">
                      {r.is_active ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FxRatesTab({ rows, currencyCodes, canEdit }: { rows: FxRateRow[]; currencyCodes: string[]; canEdit: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [currencyCode, setCurrencyCode] = useState(currencyCodes[0] ?? "");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [rate, setRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSave() {
    const parsedRate = parseFloat(rate);
    if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
      setError("Rate must be a positive number.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await upsertFxRateAction(currencyCode, effectiveDate, parsedRate, "manual");
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setAdding(false);
    setRate("");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {canEdit && (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted"
        >
          <Plus className="h-4 w-4" /> Add rate
        </button>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      {adding && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-primary-light/20 p-3">
          <label className="text-xs text-ink-muted">
            Currency
            <select value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}
              className="mt-0.5 block rounded-md border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
              {currencyCodes.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-xs text-ink-muted">
            Effective date
            <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)}
              className="mt-0.5 block rounded-md border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>
          <label className="text-xs text-ink-muted">
            Rate to AED
            <input type="number" step="0.000001" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="3.6725"
              className="mt-0.5 block w-28 rounded-md border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>
          <button onClick={handleSave} disabled={pending} className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-60">Save</button>
          <button onClick={() => setAdding(false)} className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-surface-muted">Cancel</button>
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2">Currency</th>
              <th className="px-4 py-2">Effective Date</th>
              <th className="px-4 py-2">Rate to AED</th>
              <th className="px-4 py-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-ink-muted">No rates recorded yet.</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-mono text-xs text-ink-muted">{r.currency_code}</td>
                <td className="px-4 py-2 text-ink-muted">{r.effective_date}</td>
                <td className="px-4 py-2 tabular-nums text-ink">{r.rate_to_aed}</td>
                <td className="px-4 py-2 text-ink-muted">{r.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
