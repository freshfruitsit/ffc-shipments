import { redirect } from "next/navigation";
import { getAppShellContext } from "@/lib/data/app-shell-context";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await getAppShellContext();

  if (!context.ok) {
    // Item 1 fix (preserved): every failure mode goes to /access-denied.
    // The "not authenticated" case no longer has a branch here at all —
    // proxy.ts's getClaims() check is what catches a signed-out visitor,
    // before this layout is ever reached, so this layout only needs to
    // handle profile-level problems (no-profile / inactive) plus a
    // generic db-error fallback.
    if (context.reason === "no-profile") {
      redirect("/access-denied?reason=no-profile");
    }
    if (context.reason === "inactive") {
      redirect("/access-denied?reason=inactive");
    }
    redirect("/access-denied?reason=db-error");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface-muted">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          fullName={context.full_name}
          role={context.role}
          branchName={context.branch_name}
          unreadNotificationCount={context.unread_notification_count}
        />
        <main className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
