import { LogOut } from "lucide-react";
import { logout } from "@/lib/actions/auth";

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
}: {
  fullName: string;
  role: string;
  branchName: string | null;
}) {
  const initials = fullName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-surface px-4 lg:px-6">
      <div />
      <div className="flex items-center gap-3">
        <div className="hidden text-right leading-tight sm:block">
          <p className="text-sm font-medium text-ink">{fullName}</p>
          <p className="text-xs text-ink-muted">
            {ROLE_LABELS[role] ?? role}
            {branchName ? ` · ${branchName}` : ""}
          </p>
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
