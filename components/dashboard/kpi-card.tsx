import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export function KpiCard({
  icon: Icon, value, label, trend, up, href,
}: {
  icon: LucideIcon;
  value: number;
  label: string;
  trend: string;
  up: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-border bg-surface p-4 transition hover:border-primary/40 hover:shadow-sm"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-light text-primary-dark">
        <Icon className="h-[17px] w-[17px]" strokeWidth={2} />
      </div>
      <p className="mt-2.5 text-[28px] font-semibold leading-none text-ink">{value}</p>
      <p className="mt-1.5 text-[13px] text-ink-muted">{label}</p>
      <p className={`mt-1 text-xs font-medium ${up ? "text-primary-dark" : "text-danger"}`}>
        {up ? "▲" : "▼"} {trend}
      </p>
    </Link>
  );
}
