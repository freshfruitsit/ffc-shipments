"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DETAIL_TABS } from "@/lib/prototype-constants";

export function ShipmentTabs({ shipmentId }: { shipmentId: string }) {
  const pathname = usePathname();

  return (
    <div className="overflow-x-auto border-b border-border">
      <nav className="flex min-w-max gap-1 px-1">
        {DETAIL_TABS.map((tab) => {
          const href = `/shipments/${shipmentId}/${tab.segment}`;
          const active = pathname === href;
          return (
            <Link
              key={tab.segment}
              href={href}
              className={`whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[12.5px] font-semibold transition ${
                active
                  ? "border-primary text-primary-dark"
                  : "border-transparent text-ink-muted hover:border-border hover:text-ink"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
