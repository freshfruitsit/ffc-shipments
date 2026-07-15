"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { segment: "overview", label: "Overview" },
  { segment: "transport", label: "Transport" },
  { segment: "invoices", label: "Invoices" },
  { segment: "documents", label: "Documents" },
  { segment: "customs", label: "Dubai Customs" },
  { segment: "municipality", label: "Dubai Municipality" },
  { segment: "delivery-order", label: "Delivery Order" },
  { segment: "mofaic", label: "MOFAIC" },
  { segment: "physical-documents", label: "Physical Documents" },
  { segment: "comments", label: "Comments" },
];

export function ShipmentTabs({ shipmentId }: { shipmentId: string }) {
  const pathname = usePathname();

  return (
    <div className="overflow-x-auto border-b border-border">
      <nav className="flex min-w-max gap-1 px-1">
        {TABS.map((tab) => {
          const href = `/shipments/${shipmentId}/${tab.segment}`;
          const active = pathname === href;
          return (
            <Link
              key={tab.segment}
              href={href}
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${
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
