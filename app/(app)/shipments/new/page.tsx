import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateShipmentWizard } from "@/components/wizard/create-shipment-wizard";

type FormContext = {
  user_id: string;
  fixed_branch_id: string | null;
  branches: { id: string; name: string }[];
  permissions: Record<string, boolean>;
  categories: { id: string; name: string }[];
  countries: { id: string; name: string }[];
  ports: { id: string; name: string }[];
  airlines: { id: string; name: string }[];
  freight_agents: { id: string; name: string }[];
  clearing_agents: { id: string; name: string }[];
  carriers: { id: string; name: string }[];
  courier_companies: { id: string; name: string }[];
  document_types: { id: string; name: string }[];
  currencies: string[];
};

export default async function NewShipmentPage() {
  const supabase = await createClient();

  // Item 6 (performance): this page used to fire ~13 separate requests —
  // 3 has_permission calls, a profile lookup, 11 master-data queries, an
  // unfiltered v_assignable_profiles query, and a role_permissions join
  // done client-side. Now it's this one RPC plus the 3 permission-scoped
  // assignable-profiles calls (which genuinely differ per duty and can't
  // be collapsed into the same RPC without either fetching every
  // profile's full permission matrix up front or losing the per-duty
  // filtering — three is still a large reduction from the old count).
  const { data, error } = await supabase.rpc("get_new_shipment_form_context");
  if (error) {
    console.error("[new-shipment] get_new_shipment_form_context failed:", error.message);
    redirect("/shipments");
  }
  if (!data) redirect("/login");
  const ctx = data as unknown as FormContext;

  if (!ctx.permissions.create_draft) redirect("/shipments");

  const [{ data: deliveryOrderProfiles }, { data: mofaicProfiles }, { data: physicalDocsProfiles }, { data: allProfiles }] =
    await Promise.all([
      supabase.rpc("get_assignable_profiles", { p_branch_id: null, p_required_permission: "edit_delivery_order" }),
      supabase.rpc("get_assignable_profiles", { p_branch_id: null, p_required_permission: "edit_mofaic" }),
      supabase.rpc("get_assignable_profiles", { p_branch_id: null, p_required_permission: "edit_physical_docs" }),
      supabase.rpc("get_assignable_profiles", { p_branch_id: null, p_required_permission: null }),
    ]);

  return (
    <div className="mx-auto max-w-5xl space-y-1">
      <div>
        <h1 className="text-xl font-semibold text-ink">Create Shipment</h1>
        <p className="text-sm text-ink-muted">Structured shipment intake wizard</p>
      </div>

      <CreateShipmentWizard
        userId={ctx.user_id}
        branches={ctx.branches}
        fixedBranchId={ctx.fixed_branch_id}
        categories={ctx.categories}
        countries={ctx.countries}
        airlines={ctx.airlines}
        ports={ctx.ports}
        freightAgents={ctx.freight_agents}
        clearingAgents={ctx.clearing_agents}
        carriers={ctx.carriers}
        couriers={ctx.courier_companies}
        documentTypes={ctx.document_types}
        currencies={ctx.currencies}
        profiles={(allProfiles ?? []).map((p) => ({ id: p.id, name: p.full_name }))}
        deliveryOrderProfiles={(deliveryOrderProfiles ?? []).map((p) => ({ id: p.id, name: p.full_name }))}
        mofaicProfiles={(mofaicProfiles ?? []).map((p) => ({ id: p.id, name: p.full_name }))}
        physicalDocsProfiles={(physicalDocsProfiles ?? []).map((p) => ({ id: p.id, name: p.full_name }))}
        canAdministerSuppliers={!!ctx.permissions.administer}
      />
    </div>
  );
}
