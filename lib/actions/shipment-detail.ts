"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyRpcError } from "@/lib/actions/errors";

export type ActionState = { error?: string; success?: boolean; fieldErrors?: Record<string, string> };

const TransportSchema = z.object({
  shipment_id: z.string().uuid(),
  awb: z.string().trim().optional(),
  airline_id: z.string().uuid().optional().or(z.literal("")),
  flight: z.string().trim().optional(),
  eta: z.string().optional(),
  port_id: z.string().uuid().optional().or(z.literal("")),
  freight_agent_id: z.string().uuid().optional().or(z.literal("")),
  clearing_agent_id: z.string().uuid().optional().or(z.literal("")),
  packages: z.coerce.number().int().optional(),
  net_weight: z.coerce.number().optional(),
  gross_weight: z.coerce.number().optional(),
  transport_remarks: z.string().trim().optional(),
});

export async function updateTransportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = TransportSchema.safeParse(raw);
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    const fieldErrors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) fieldErrors[k] = v[0];
    return { fieldErrors };
  }
  const supabase = await createClient();
  const d = parsed.data;
  const { error } = await supabase.rpc("update_shipment_transport", {
    p_shipment_id: d.shipment_id,
    p_awb: d.awb || null,
    p_airline_id: d.airline_id || null,
    p_flight: d.flight || null,
    p_eta: d.eta ? new Date(d.eta).toISOString() : null,
    p_port_id: d.port_id || null,
    p_freight_agent_id: d.freight_agent_id || null,
    p_clearing_agent_id: d.clearing_agent_id || null,
    p_packages: d.packages ?? null,
    p_net_weight: d.net_weight ?? null,
    p_gross_weight: d.gross_weight ?? null,
    p_transport_remarks: d.transport_remarks || null,
  });
  if (error) return { error: friendlyRpcError(error.message) };
  revalidatePath(`/shipments/${d.shipment_id}`);
  return { success: true };
}

const InvoiceSchema = z.object({
  shipment_id: z.string().uuid(),
  invoice_no: z.string().trim().min(1, "Invoice number is required"),
  invoice_date: z.string().min(1, "Invoice date is required"),
  invoice_value: z.coerce.number().min(0, "Invoice value cannot be negative"),
  currency_code: z.string().trim().min(1, "Currency is required"),
  purchase_order_no: z.string().trim().optional(),
  supplier_reference: z.string().trim().optional(),
  payment_terms: z.string().trim().optional(),
  remarks: z.string().trim().optional(),
});

export async function addInvoiceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = InvoiceSchema.safeParse(raw);
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    const fieldErrors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) fieldErrors[k] = v[0];
    return { fieldErrors };
  }
  const supabase = await createClient();
  const d = parsed.data;

  // Shipment's own supplier is the natural default for an invoice, so this
  // page doesn't need its own supplier picker — the RPC snapshots whatever
  // name is passed here (null supplier_id, so the free-text branch applies).
  const { data: shipment } = await supabase.from("shipments").select("supplier_name_snapshot, supplier_id").eq("id", d.shipment_id).single();

  const { error } = await supabase.rpc("add_invoice", {
    p_shipment_id: d.shipment_id,
    p_invoice_no: d.invoice_no,
    p_invoice_date: d.invoice_date,
    p_supplier_id: shipment?.supplier_id ?? null,
    p_supplier_name: shipment?.supplier_name_snapshot ?? null,
    p_invoice_value: d.invoice_value,
    p_currency_code: d.currency_code,
    p_purchase_order_no: d.purchase_order_no || null,
    p_supplier_reference: d.supplier_reference || null,
    p_payment_terms: d.payment_terms || null,
    p_remarks: d.remarks || null,
  });
  if (error) return { error: friendlyRpcError(error.message) };
  revalidatePath(`/shipments/${d.shipment_id}`);
  return { success: true };
}

const CommentSchema = z.object({
  shipment_id: z.string().uuid(),
  body: z.string().trim().min(1, "Comment cannot be empty"),
});

export async function addCommentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = CommentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.body?.[0] };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_comment", {
    p_shipment_id: parsed.data.shipment_id,
    p_body: parsed.data.body,
  });
  if (error) return { error: friendlyRpcError(error.message) };
  revalidatePath(`/shipments/${parsed.data.shipment_id}/comments`);
  return { success: true };
}
