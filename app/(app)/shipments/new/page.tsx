import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewShipmentForm } from "@/components/shipments/new-shipment-form";

export default async function NewShipmentPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: canCreate }, { data: canViewAllBranches }, { data: canAdminister }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission: "create_draft" }),
    supabase.rpc("has_permission", { p_permission: "view_all_branches" }),
    supabase.rpc("has_permission", { p_permission: "administer" }),
  ]);

  if (!canCreate) {
    redirect("/shipments");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("branch_id")
    .eq("id", user.id)
    .single();

  // Item 3: a user without view_all_branches only ever sees their own
  // branch, pre-selected and effectively fixed — a user WITH it sees every
  // active branch and picks. Either way, fn_require_branch_access() inside
  // create_shipment is the real security boundary; this only shapes the UI.
  const branchQuery = supabase.from("branches").select("id, name").eq("is_active", true).order("display_order");
  const { data: branches } = canViewAllBranches
    ? await branchQuery
    : await branchQuery.eq("id", profile?.branch_id ?? "");

  const [{ data: categories }, { data: countries }, { data: suppliers }] = await Promise.all([
    supabase.from("shipment_categories").select("id, name").eq("is_active", true).order("display_order"),
    supabase.from("countries").select("id, name").eq("is_active", true).order("name"),
    supabase.from("suppliers").select("id, name").eq("is_active", true).order("name"),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">New Shipment</h1>
        <p className="text-sm text-ink-muted">
          Quick create — transport, invoices, and documents can be added from the shipment page after it&apos;s created.
        </p>
      </div>

      <NewShipmentForm
        branches={branches ?? []}
        categories={categories ?? []}
        countries={countries ?? []}
        suppliers={suppliers ?? []}
        fixedBranchId={canViewAllBranches ? null : profile?.branch_id ?? null}
        canAdministerSuppliers={!!canAdminister}
      />
    </div>
  );
}
