"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";

const MODULE_OPTIONS = [
  "All modules", "shipments", "documents", "exceptions", "invoices", "profiles",
  "role_permissions", "suppliers", "import_batches", "notifications", "discovery_items",
];

export function AuditFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");

  function updateParam(key: string, value: string, sentinel?: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== sentinel) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateParam("q", search);
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3 sm:flex-row sm:flex-wrap sm:items-center">
      <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-auto sm:flex-1 sm:max-w-xs">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search action, shipment ref…"
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </form>
      <select
        defaultValue={searchParams.get("module") ?? "All modules"}
        onChange={(e) => updateParam("module", e.target.value, "All modules")}
        className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      >
        {MODULE_OPTIONS.map((m) => (
          <option key={m}>{m}</option>
        ))}
      </select>
      <input
        type="date"
        defaultValue={searchParams.get("from") ?? ""}
        onChange={(e) => updateParam("from", e.target.value)}
        className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        title="From date"
      />
      <input
        type="date"
        defaultValue={searchParams.get("to") ?? ""}
        onChange={(e) => updateParam("to", e.target.value)}
        className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        title="To date"
      />
    </div>
  );
}
