import { LogOut, HelpCircle } from "lucide-react";
import { logout } from "@/lib/actions/auth";
import { GlobalSearchBar } from "@/components/layout/global-search-bar";
import { NotificationBell } from "@/components/layout/notification-bell";

const ROLE_LABELS: Record<string, string> = {
  shipment_data_entry: "Shipment Data Entry",
  documentation_user: "Documentation User",
  customs_clearance_user: "Customs/Clearance User",
  shipment_coordinator: "Shipment Coordinator",
  shipment_supervisor: "Shipment Supervisor",
  finance_user: "Finance User",
  management_read_only: "Management (Read Only)",
  system_administrator: "System Administrator",
};

export function Topbar({
  fullName,
  role,
  branchName,
  unreadNotificationCount,
}: {
  fullName: string;
  role: string;
  branchName: string | null;
  unreadNotificationCount: number;
}) {
  const initials = fullName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="flex h-16 items-center gap-4 border-b border-border bg-surface px-4 lg:px-6">
      <div className="hidden leading-tight md:block">
        <p className="text-[15px] font-semibold text-ink">FFC Shipments Management System</p>
        <p className="text-[11px] text-ink-muted">Shipment, Customs, Documentation and Follow-up Platform</p>
      </div>

      <GlobalSearchBar />

      <div className="ml-auto flex items-center gap-2">
        {branchName && (
          <span className="hidden rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-ink-muted lg:inline-block">
            {branchName}
          </span>
        )}
        <NotificationBell initialUnreadCount={unreadNotificationCount} />
        <button
          title="Help"
          className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted transition hover:bg-surface-muted hover:text-ink"
        >
          <HelpCircle className="h-4.5 w-4.5" strokeWidth={2} />
        </button>

        <div className="hidden text-right leading-tight sm:block">
          <p className="text-sm font-medium text-ink">{fullName}</p>
          <p className="text-xs text-ink-muted">{ROLE_LABELS[role] ?? role}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-light text-sm font-semibold text-primary-dark">
          {initials || "?"}
        </div>
        <form action={logout}>
          <button
            type="submit"
            title="Sign out"
            className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted transition hover:bg-surface-muted hover:text-ink"
          >
            <LogOut className="h-4.5 w-4.5" strokeWidth={2} />
          </button>
        </form>
      </div>
    </header>
  );
}
