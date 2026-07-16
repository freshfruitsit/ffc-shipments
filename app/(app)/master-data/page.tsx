import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NamedMasterDataTab } from "@/components/master-data/named-master-data-tab";
import { CodedMasterDataTab } from "@/components/master-data/coded-master-data-tab";
import { CurrenciesTab, FxRatesTab } from "@/components/master-data/currency-fx-tabs";

const TABS = [
  { key: "branches", label: "Branches", kind: "coded", codeRequired: true },
  { key: "suppliers", label: "Suppliers", kind: "coded", codeRequired: false },
  { key: "countries", label: "Origin Countries", kind: "coded", codeRequired: false },
  { key: "ports", label: "Ports", kind: "coded", codeRequired: true },
  { key: "airlines", label: "Airlines", kind: "coded", codeRequired: false },
  { key: "freight_agents", label: "Freight Agents", kind: "named" },
  { key: "clearing_agents", label: "Clearing Agents", kind: "named" },
  { key: "carriers", label: "Carriers", kind: "named" },
  { key: "courier_companies", label: "Courier Companies", kind: "named" },
  { key: "shipment_categories", label: "Shipment Categories", kind: "named" },
  { key: "document_types", label: "Document Types", kind: "named" },
  { key: "exception_types", label: "Exception Types", kind: "named" },
  { key: "currencies", label: "Currencies", kind: "currencies" },
  { key: "fx_rates", label: "FX Rates", kind: "fx_rates" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default async function MasterDataPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: tabParam } = await searchParams;
  const activeTab = (TABS.find((t) => t.key === tabParam)?.key ?? "branches") as TabKey;
  const activeDef = TABS.find((t) => t.key === activeTab)!;

  const supabase = await createClient();
  const { data: canEdit } = await supabase.rpc("has_permission", { p_permission: "administer" });

  let content: React.ReactNode = null;

  if (activeDef.kind === "coded") {
    const table = activeTab as "branches" | "suppliers" | "countries" | "ports" | "airlines";
    let normalized: { id: string; code: string | null; name: string; is_active: boolean; display_order: number }[] = [];

    if (table === "countries") {
      const { data: rows } = await supabase.from("countries").select("id, iso_code, name, is_active, display_order").order("display_order");
      normalized = (rows ?? []).map((r) => ({ id: r.id, code: r.iso_code, name: r.name, is_active: r.is_active, display_order: r.display_order }));
    } else if (table === "branches") {
      const { data: rows } = await supabase.from("branches").select("id, code, name, is_active, display_order").order("display_order");
      normalized = (rows ?? []).map((r) => ({ id: r.id, code: r.code, name: r.name, is_active: r.is_active, display_order: r.display_order }));
    } else if (table === "suppliers") {
      const { data: rows } = await supabase.from("suppliers").select("id, code, name, is_active, display_order").order("display_order");
      normalized = (rows ?? []).map((r) => ({ id: r.id, code: r.code, name: r.name, is_active: r.is_active, display_order: r.display_order }));
    } else if (table === "ports") {
      const { data: rows } = await supabase.from("ports").select("id, code, name, is_active, display_order").order("display_order");
      normalized = (rows ?? []).map((r) => ({ id: r.id, code: r.code, name: r.name, is_active: r.is_active, display_order: r.display_order }));
    } else if (table === "airlines") {
      const { data: rows } = await supabase.from("airlines").select("id, code, name, is_active, display_order").order("display_order");
      normalized = (rows ?? []).map((r) => ({ id: r.id, code: r.code, name: r.name, is_active: r.is_active, display_order: r.display_order }));
    }

    content = <CodedMasterDataTab table={table} rows={normalized} canEdit={!!canEdit} codeRequired={activeDef.codeRequired ?? false} />;
  } else if (activeDef.kind === "named") {
    const table = activeTab as "freight_agents" | "clearing_agents" | "carriers" | "courier_companies" | "shipment_categories" | "document_types" | "exception_types";
    const { data: rows } = await supabase.from(table).select("id, name, is_active, display_order").order("display_order");
    content = <NamedMasterDataTab table={table} rows={rows ?? []} canEdit={!!canEdit} />;
  } else if (activeDef.kind === "currencies") {
    const { data: rows } = await supabase.from("currencies").select("code, name, is_active").order("code");
    content = <CurrenciesTab rows={rows ?? []} canEdit={!!canEdit} />;
  } else if (activeDef.kind === "fx_rates") {
    const [{ data: rows }, { data: currencies }] = await Promise.all([
      supabase.from("fx_rates").select("id, currency_code, effective_date, rate_to_aed, source").order("effective_date", { ascending: false }).limit(100),
      supabase.from("currencies").select("code").eq("is_active", true).order("code"),
    ]);
    content = <FxRatesTab rows={rows ?? []} currencyCodes={(currencies ?? []).map((c) => c.code)} canEdit={!!canEdit} />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Master Data</h1>
        <p className="text-sm text-ink-muted">
          {canEdit
            ? "Reference data used throughout the system. Deactivating an entry hides it from new selections without breaking existing shipments that already reference it."
            : "Read-only — you don't have the administer permission required to edit master data."}
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/master-data?tab=${t.key}`}
            className={`rounded-t-md border-b-2 px-3 py-2 text-xs font-semibold transition ${
              activeTab === t.key ? "border-primary text-primary-dark" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {content}
    </div>
  );
}
