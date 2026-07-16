import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { UserManagementTable } from "@/components/admin/user-management-table";
import { PermissionMatrix } from "@/components/admin/permission-matrix";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = tab === "permissions" ? "permissions" : "users";

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const { data: canAdminister } = await supabase.rpc("has_permission", { p_permission: "administer" });

  if (!canAdminister) {
    return (
      <div className="rounded-lg border border-warning/30 bg-warning-light p-6 text-sm text-warning">
        Administration requires the administer permission, which your role doesn&apos;t have.
      </div>
    );
  }

  let content: React.ReactNode;
  if (activeTab === "permissions") {
    const [{ data: permissions }, { data: rolePermissions }] = await Promise.all([
      supabase.from("permissions").select("code, description").order("code"),
      supabase.from("role_permissions").select("role, permission, allowed"),
    ]);
    content = <PermissionMatrix permissions={permissions ?? []} rolePermissions={rolePermissions ?? []} />;
  } else {
    const [{ data: profiles }, { data: branches }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, role, branch_id, is_active").order("full_name"),
      supabase.from("branches").select("id, name").order("display_order"),
    ]);
    content = <UserManagementTable profiles={profiles ?? []} branches={branches ?? []} currentUserId={userData?.user?.id ?? ""} />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Administration</h1>
        <p className="text-sm text-ink-muted">User roles/branches and the fixed permission matrix.</p>
      </div>

      <div className="flex gap-1 border-b border-border">
        <Link
          href="/admin?tab=users"
          className={`rounded-t-md border-b-2 px-3 py-2 text-xs font-semibold transition ${activeTab === "users" ? "border-primary text-primary-dark" : "border-transparent text-ink-muted hover:text-ink"}`}
        >
          Users
        </Link>
        <Link
          href="/admin?tab=permissions"
          className={`rounded-t-md border-b-2 px-3 py-2 text-xs font-semibold transition ${activeTab === "permissions" ? "border-primary text-primary-dark" : "border-transparent text-ink-muted hover:text-ink"}`}
        >
          Permission Matrix
        </Link>
      </div>

      {content}
    </div>
  );
}
