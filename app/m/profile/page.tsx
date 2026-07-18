import { LogOut } from "lucide-react";
import { getAppShellContext } from "@/lib/data/app-shell-context";
import { logout } from "@/lib/actions/auth";

export default async function MobileProfilePage() {
  const context = await getAppShellContext();
  if (!context.ok) return null;

  const initials = context.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="px-4 pt-6">
      <p className="font-display text-[11px] font-semibold uppercase tracking-wide text-primary-dark">FFC Field</p>
      <h1 className="font-display text-2xl font-semibold text-ink">Profile</h1>

      <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-base font-bold text-white">
          {initials}
        </span>
        <div>
          <p className="font-display text-[15px] font-semibold text-ink">{context.full_name}</p>
          <p className="text-[12.5px] text-ink-muted">{context.role.replace(/_/g, " ")}</p>
          {context.branch_name && <p className="text-[12.5px] text-ink-muted">{context.branch_name}</p>}
        </div>
      </div>

      <form action={logout} className="mt-6">
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-danger/30 bg-danger-light px-4 py-3 text-sm font-medium text-danger active:bg-danger-light/70"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </form>

      <p className="mt-6 text-center text-[11px] text-ink-muted">
        For the full desktop experience — reports, master data, and administration — sign in at the regular
        FFC Shipments web address on a computer.
      </p>
    </div>
  );
}
