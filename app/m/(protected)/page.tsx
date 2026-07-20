"use client";

import { useState, useRef, useCallback } from "react";
import { Search, PlaneTakeoff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ShipmentCard, type ShipmentCardData } from "@/components/pwa/shipment-card";

const DEBOUNCE_MS = 300;

export default function MobileSearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ShipmentCardData[] | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults(null);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase.rpc("search_shipments", { p_query: q, p_page: 1, p_page_size: 20 });
    setResults(
      (data ?? []).map((row) => ({
        id: row.id, ref: row.ref, supplier_name_snapshot: row.supplier_name_snapshot,
        overall_status: row.overall_status, eta: row.eta, port: row.port,
      }))
    );
    setLoading(false);
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(value), DEBOUNCE_MS);
  }

  return (
    <div className="px-4 pt-6">
      <p className="font-display text-[11px] font-semibold uppercase tracking-wide text-primary-dark">FFC Field</p>
      <h1 className="font-display text-2xl font-semibold text-ink">Find a shipment</h1>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-3">
        <Search className="h-4 w-4 shrink-0 text-ink-muted" />
        <input
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Reference, AWB, or supplier…"
          autoComplete="off"
          className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-muted"
        />
      </div>

      <div className="mt-4 space-y-2.5">
        {loading && <p className="py-8 text-center text-sm text-ink-muted">Searching…</p>}

        {!loading && results === null && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <PlaneTakeoff className="h-8 w-8 text-primary/40" strokeWidth={1.5} />
            <p className="text-sm text-ink-muted">Search by reference, AWB, or supplier to get started.</p>
          </div>
        )}

        {!loading && results !== null && results.length === 0 && (
          <p className="py-16 text-center text-sm text-ink-muted">No shipments match &quot;{query}&quot;.</p>
        )}

        {!loading && results?.map((s) => <ShipmentCard key={s.id} shipment={s} />)}
      </div>
    </div>
  );
}
