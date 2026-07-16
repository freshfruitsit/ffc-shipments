"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendlyRpcError } from "@/lib/actions/errors";

export type MasterDataActionState = { error?: string; success?: boolean };

// Tables with just { name, is_active, display_order } — no code field.
const NAMED_TABLE_RPC = {
  freight_agents: "upsert_freight_agent",
  clearing_agents: "upsert_clearing_agent",
  carriers: "upsert_carrier",
  courier_companies: "upsert_courier_company",
  shipment_categories: "upsert_shipment_category",
  document_types: "upsert_document_type",
  exception_types: "upsert_exception_type",
} as const;
export type NamedMasterTable = keyof typeof NAMED_TABLE_RPC;

// Tables with { code, name, is_active, display_order }.
const CODED_TABLE_RPC = {
  branches: "upsert_branch",
  suppliers: "upsert_supplier",
  countries: "upsert_country",
  ports: "upsert_port",
  airlines: "upsert_airline",
} as const;
export type CodedMasterTable = keyof typeof CODED_TABLE_RPC;

export async function upsertNamedItemAction(
  table: NamedMasterTable,
  id: string | null,
  name: string,
  isActive: boolean,
  displayOrder: number
): Promise<MasterDataActionState> {
  if (!name.trim()) return { error: "Name cannot be blank." };
  const supabase = await createClient();
  const rpcName = NAMED_TABLE_RPC[table];
  const { error } = await supabase.rpc(rpcName, {
    p_id: id, p_name: name.trim(), p_is_active: isActive, p_display_order: displayOrder,
  });
  if (error) return { error: friendlyRpcError(error.message) };
  revalidatePath("/master-data");
  return { success: true };
}

export async function upsertCodedItemAction(
  table: CodedMasterTable,
  id: string | null,
  code: string | null,
  name: string,
  isActive: boolean,
  displayOrder: number
): Promise<MasterDataActionState> {
  if (!name.trim()) return { error: "Name cannot be blank." };
  if (table === "branches" && !code?.trim()) return { error: "Branches require a code." };
  if (table === "ports" && !code?.trim()) return { error: "Ports require a code." };
  const supabase = await createClient();
  const rpcName = CODED_TABLE_RPC[table];
  const { error } = await supabase.rpc(rpcName, {
    p_id: id, p_code: code?.trim() || null, p_name: name.trim(), p_is_active: isActive, p_display_order: displayOrder,
  });
  if (error) return { error: friendlyRpcError(error.message) };
  revalidatePath("/master-data");
  return { success: true };
}

export async function upsertCurrencyAction(
  code: string,
  name: string,
  isActive: boolean
): Promise<MasterDataActionState> {
  if (!code.trim() || !name.trim()) return { error: "Code and name are both required." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_currency", { p_code: code.trim(), p_name: name.trim(), p_is_active: isActive });
  if (error) return { error: friendlyRpcError(error.message) };
  revalidatePath("/master-data");
  return { success: true };
}

export async function upsertFxRateAction(
  currencyCode: string,
  effectiveDate: string,
  rateToAed: number,
  source: string
): Promise<MasterDataActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_fx_rate", {
    p_currency_code: currencyCode, p_effective_date: effectiveDate, p_rate_to_aed: rateToAed, p_source: source || "manual",
  });
  if (error) return { error: friendlyRpcError(error.message) };
  revalidatePath("/master-data");
  return { success: true };
}
