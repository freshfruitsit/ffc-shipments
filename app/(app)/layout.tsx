import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Item 1 fix: distinguish every failure mode explicitly, and send all of
  // them to /access-denied (never /login) — redirecting an authenticated
  // user back to /login is exactly what produced the infinite loop
  // (proxy.ts bounces an authenticated user away from /login, straight
  // back into this layout, back to /login...).
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError) {
    // PGRST116 = PostgREST's code for ".single() found zero rows" — a
    // genuine "no profile exists" case. Anything else is a real database/
    // network error, which must NOT be treated as "no profile" (that would
    // misdiagnose a transient outage as an unprovisioned account).
    if (profileError.code === "PGRST116") {
      redirect("/access-denied?reason=no-profile");
    }
    redirect("/access-denied?reason=db-error");
  }

  if (!profile.is_active) {
    redirect("/access-denied?reason=inactive");
  }

  let branchName: string | null = null;
  if (profile.branch_id) {
    const { data: branch } = await supabase
      .from("branches")
      .select("*")
      .eq("id", profile.branch_id)
      .single();
    branchName = branch?.name ?? null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface-muted">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar fullName={profile.full_name} role={profile.role} branchName={branchName} />
        <main className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
