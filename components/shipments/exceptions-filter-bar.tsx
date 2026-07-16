"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

const STATUS_OPTIONS = [
  "Open statuses",
  "Open",
  "Under Review",
  "Waiting for Supplier",
  "Waiting for Carrier",
  "Waiting for Authority",
  "Waiting for Finance",
  "Resolved",
  "Closed",
];

const SEVERITY_OPTIONS = ["All severities", "Critical", "High", "Medium", "Low"];

export function ExceptionsFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string, sentinel: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== sentinel) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3 sm:flex-row sm:flex-wrap sm:items-center">
      <select
        defaultValue={searchParams.get("status") ?? "Open statuses"}
        onChange={(e) => updateParam("status", e.target.value, "Open statuses")}
        className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <select
        defaultValue={searchParams.get("severity") ?? "All severities"}
        onChange={(e) => updateParam("severity", e.target.value, "All severities")}
        className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      >
        {SEVERITY_OPTIONS.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </div>
  );
}
