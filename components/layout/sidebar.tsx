"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Package, CirclePlus, FileText, ShieldCheck, Truck, Landmark,
  FileStack, TriangleAlert, LineChart, Upload, Database, ClipboardCheck, Search, Settings, Leaf,
} from "lucide-react";
import { NAV_SECTIONS } from "@/lib/prototype-constants";

const ICONS: Record<string, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  shipments: Package,
  "shipments/new": CirclePlus,
  documents: FileText,
  customs: ShieldCheck,
  "delivery-orders": Truck,
  mofaic: Landmark,
  "physical-documents": FileStack,
  exceptions: TriangleAlert,
  reports: LineChart,
  import: Upload,
  "master-data": Database,
  audit: ClipboardCheck,
  discovery: Search,
  admin: Settings,
};

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-16 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface lg:w-60">
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-3 lg:px-5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-white">
          <Leaf className="h-4.5 w-4.5" strokeWidth={2} />
        </span>
        <div className="hidden leading-tight lg:block">
          <p className="text-sm font-semibold text-ink">FFC</p>
          <p className="text-[11px] text-ink-muted">Shipments Management System</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-4 lg:px-3">
        {NAV_SECTIONS.map(({ segment, label }) => {
          const href = `/${segment}`;
          let active = pathname === href;
          if (segment === "shipments") {
            active = pathname === href || (pathname.startsWith(href + "/") && !pathname.startsWith("/shipments/new"));
          } else if (segment !== "shipments/new") {
            active = active || pathname.startsWith(href + "/");
          }
          const Icon = ICONS[segment] ?? Package;
          return (
            <Link
              key={segment}
              href={href}
              title={label}
              className={`flex items-center justify-center gap-2.5 rounded-md px-3 py-2 text-sm transition lg:justify-start ${
                active
                  ? "bg-primary-light font-medium text-primary-dark"
                  : "text-ink-muted hover:bg-surface-muted hover:text-ink"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.25 : 2} />
              <span className="hidden lg:inline">{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
