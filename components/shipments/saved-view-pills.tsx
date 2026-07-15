"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { SAVED_VIEWS } from "@/lib/prototype-constants";

export function SavedViewPills() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeView = searchParams.get("view") ?? "all";

  function selectView(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", key);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {SAVED_VIEWS.map((v) => (
        <button
          key={v.key}
          onClick={() => selectView(v.key)}
          className={`rounded-2xl border px-3 py-1.5 text-[11.5px] font-semibold transition ${
            activeView === v.key
              ? "border-primary bg-primary text-white"
              : "border-border bg-surface text-ink-muted hover:bg-surface-muted"
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
