"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Package, CirclePlus, FileText, ShieldCheck, Truck, Landmark,
  FileStack, TriangleAlert, LineChart, Upload, Database, ClipboardCheck, Search, Settings,
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
    <aside className="flex h-screen w-16 shrink-0 flex-col overflow-y-auto bg-primary-dark lg:w-60">
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-white/10 px-3 lg:px-4">
        <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded">
          <Image src="/ffc-logo.png" alt="FFC" fill sizes="32px" className="object-contain" priority />
        </span>
        <div className="hidden leading-tight lg:block">
          <p className="text-sm font-bold text-white">FFC</p>
          <p className="text-[10.5px] text-[#bfe0cd]">Shipments Management System</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto py-2.5">
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
              className={`flex items-center justify-center gap-3 border-l-[3px] px-4 py-2.5 text-[13px] font-medium transition lg:justify-start ${
                active
                  ? "border-l-[#58c98a] bg-white/10 text-white"
                  : "border-l-transparent text-[#cfe6da] hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
              <span className="hidden truncate lg:inline">{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
