"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CreateShipmentSchema, AddSupplierSchema } from "@/lib/schemas/shipments";
import { friendlyRpcError } from "@/lib/actions/errors";

export type CreateShipmentState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  createdShipment?: { id: string; ref: string };
};


export async function createShipmentAction(
  _prevState: CreateShipmentState,
  formData: FormData
): Promise<CreateShipmentState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = CreateShipmentSchema.safeParse(raw);

  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    const fieldErrors: Record<string, string> = {};
    for (const [key, messages] of Object.entries(flat)) {
      if (messages?.[0]) fieldErrors[key] = messages[0];
    }
    return { fieldErrors };
  }

  if (!parsed.data.supplier_id && !parsed.data.supplier_name) {
    return { fieldErrors: { supplier_id: "Select a supplier, or use \"Supplier not listed\" below" } };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Your session has expired. Please sign in again." };
  }

  const { data, error } = await supabase.rpc("create_shipment", {
    p_mode: parsed.data.mode || "Air",
    p_shipment_date: parsed.data.shipment_date,
    p_category_id: parsed.data.category_id || null,
    p_branch_id: parsed.data.branch_id,
    p_supplier_id: parsed.data.supplier_id || null,
    p_supplier_name: parsed.data.supplier_name || "",
    p_origin_country_id: parsed.data.origin_country_id || null,
    p_priority: parsed.data.priority || null,
    p_responsible: parsed.data.responsible,
    p_internal_ref: parsed.data.internal_ref || null,
    p_notes: parsed.data.notes || null,
  });

  if (error) {
    return { error: friendlyRpcError(error.message) };
  }

  // Item 7: confirm a real shipment id came back before proceeding — don't
  // trust "no error" alone.
  if (!data?.id) {
    return { error: "The shipment may not have been created correctly. Please check the register before retrying." };
  }

  revalidatePath("/shipments");
  return { createdShipment: { id: data.id, ref: data.ref } };
}

export type AddSupplierState = {
  error?: string;
  supplier?: { id: string; name: string };
};

/** Administer-only — enforced by the upsert_supplier RPC itself, not just here. */
export async function addSupplierAction(
  _prevState: AddSupplierState,
  formData: FormData
): Promise<AddSupplierState> {
  const parsed = AddSupplierSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.name?.[0] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("upsert_supplier", {
    p_id: null,
    p_code: null,
    p_name: parsed.data.name,
    p_is_active: true,
    p_display_order: 0,
  });

  if (error) {
    return { error: friendlyRpcError(error.message) };
  }

  revalidatePath("/shipments/new");
  return { supplier: { id: data.id, name: data.name } };
}
