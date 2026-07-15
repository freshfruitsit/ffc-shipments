import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateShipmentWizard } from "@/components/wizard/create-shipment-wizard";
import {
  getActiveBranches, getShipmentCategories, getCountries, getAirlines, getPorts,
  getFreightAgents, getClearingAgents, getCarriers, getCourierCompanies, getDocumentTypes, getCurrencies,
} from "@/lib/data/master-data";

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
  if (!canCreate) redirect("/shipments");

  const { data: profile } = await supabase.from("profiles").select("branch_id").eq("id", user.id).single();

  const [
    allBranches, categories, countries, airlines, ports, freightAgents, clearingAgents,
    carriers, couriers, documentTypes, currencies, { data: suppliers }, { data: profiles },
  ] = await Promise.all([
    getActiveBranches(), getShipmentCategories(), getCountries(), getAirlines(), getPorts(),
    getFreightAgents(), getClearingAgents(), getCarriers(), getCourierCompanies(), getDocumentTypes(), getCurrencies(),
    supabase.from("suppliers").select("id, name").eq("is_active", true).order("name"),
    supabase.from("v_assignable_profiles").select("id, full_name").order("full_name"),
  ]);

  const branches = canViewAllBranches ? allBranches : allBranches.filter((b) => b.id === profile?.branch_id);

  return (
    <div className="mx-auto max-w-5xl space-y-1">
      <div>
        <h1 className="text-xl font-semibold text-ink">Create Shipment</h1>
        <p className="text-sm text-ink-muted">Structured shipment intake wizard</p>
      </div>

      <CreateShipmentWizard
        userId={user.id}
        branches={branches}
        fixedBranchId={canViewAllBranches ? null : profile?.branch_id ?? null}
        categories={categories}
        countries={countries}
        airlines={airlines}
        ports={ports}
        freightAgents={freightAgents}
        clearingAgents={clearingAgents}
        carriers={carriers}
        couriers={couriers}
        documentTypes={documentTypes}
        currencies={currencies}
        suppliers={suppliers ?? []}
        profiles={(profiles ?? []).map((p) => ({ id: p.id, name: p.full_name }))}
        canAdministerSuppliers={!!canAdminister}
      />
    </div>
  );
}
