"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Package, User } from "lucide-react";

export function BottomNav({ fullName }: { fullName: string }) {
  const pathname = usePathname();
  const initials = fullName.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  const tabs = [
    { href: "/m", label: "Search", icon: Search, match: (p: string) => p === "/m" },
    { href: "/m/mine", label: "My Shipments", icon: Package, match: (p: string) => p.startsWith("/m/mine") },
    { href: "/m/profile", label: "Profile", icon: User, match: (p: string) => p.startsWith("/m/profile") },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10.5px] font-medium"
            >
              {tab.label === "Profile" ? (
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                    active ? "bg-primary text-white" : "bg-surface-muted text-ink-muted"
                  }`}
                >
                  {initials || <Icon className="h-3.5 w-3.5" />}
                </span>
              ) : (
                <Icon className={`h-5 w-5 ${active ? "text-primary" : "text-ink-muted"}`} strokeWidth={active ? 2.4 : 2} />
              )}
              <span className={active ? "text-primary" : "text-ink-muted"}>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
