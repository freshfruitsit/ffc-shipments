"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, Leaf } from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/shipments", label: "Shipment Register", icon: Package },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-16 shrink-0 flex-col border-r border-border bg-surface lg:w-60">
      <div className="flex h-16 items-center gap-2 border-b border-border px-3 lg:px-5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-white">
          <Leaf className="h-4.5 w-4.5" strokeWidth={2} />
        </span>
        <div className="hidden leading-tight lg:block">
          <p className="text-sm font-semibold text-ink">FFC Shipments</p>
          <p className="text-[11px] text-ink-muted">Fresh Fruits Company</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-4 lg:px-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
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

      <div className="hidden border-t border-border px-4 py-3 text-[11px] text-ink-muted lg:block">
        Module 1 — core lifecycle
      </div>
    </aside>
  );
}
