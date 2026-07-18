import { redirect } from "next/navigation";
import { getAppShellContext } from "@/lib/data/app-shell-context";
import { BottomNav } from "@/components/pwa/bottom-nav";

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const context = await getAppShellContext();

  if (!context.ok) {
    if (context.reason === "no-profile") redirect("/access-denied?reason=no-profile");
    if (context.reason === "inactive") redirect("/access-denied?reason=inactive");
    redirect("/access-denied?reason=db-error");
  }

  return (
    <div className="min-h-screen bg-pwa-bg font-sans text-ink" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="mx-auto max-w-md pb-20">{children}</div>
      <BottomNav fullName={context.full_name} />
    </div>
  );
}
