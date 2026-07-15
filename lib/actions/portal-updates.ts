"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyRpcError } from "@/lib/actions/errors";
import type { ActionState } from "@/lib/actions/shipment-detail";

const CUSTOMS_STATUSES = [
  "Not Started", "Draft", "Request Created", "Submitted", "Declaration Created",
  "Under Review", "Approved", "Rejected", "Resubmission Required", "Closed",
] as const;

const CustomsSchema = z.object({
  shipment_id: z.string().uuid(),
  declaration_no: z.string().trim().optional(),
  customs_status: z.enum(CUSTOMS_STATUSES),
  customs_submission_date: z.string().optional(),
  customs_result: z.string().trim().optional(),
  customs_remarks: z.string().trim().optional(),
});

export async function updateCustomsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = CustomsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    const fieldErrors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) fieldErrors[k] = v[0];
    return { fieldErrors };
  }
  const supabase = await createClient();
  const d = parsed.data;
  const { error } = await supabase.rpc("update_customs", {
    p_shipment_id: d.shipment_id,
    p_declaration_no: d.declaration_no || null,
    p_customs_status: d.customs_status,
    p_customs_submission_date: d.customs_submission_date || null,
    p_customs_result: d.customs_result || null,
    p_customs_remarks: d.customs_remarks || null,
  });
  if (error) return { error: friendlyRpcError(error.message) };
  revalidatePath(`/shipments/${d.shipment_id}`);
  return { success: true };
}

const MUNICIPALITY_STATUSES = [
  "Not Required", "Not Started", "Draft", "Submitted", "Under Review",
  "Finished", "Rejected", "Resubmission Required",
] as const;

const MunicipalitySchema = z.object({
  shipment_id: z.string().uuid(),
  municipality_draft_ref: z.string().trim().optional(),
  municipality_submitted_ref: z.string().trim().optional(),
  municipality_status: z.enum(MUNICIPALITY_STATUSES),
  municipality_submission_date: z.string().optional(),
  municipality_completion_date: z.string().optional(),
  municipality_remarks: z.string().trim().optional(),
});

export async function updateMunicipalityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = MunicipalitySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    const fieldErrors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) fieldErrors[k] = v[0];
    return { fieldErrors };
  }
  const supabase = await createClient();
  const d = parsed.data;
  const { error } = await supabase.rpc("update_municipality", {
    p_shipment_id: d.shipment_id,
    p_municipality_draft_ref: d.municipality_draft_ref || null,
    p_municipality_submitted_ref: d.municipality_submitted_ref || null,
    p_municipality_status: d.municipality_status,
    p_municipality_submission_date: d.municipality_submission_date || null,
    p_municipality_completion_date: d.municipality_completion_date || null,
    p_municipality_remarks: d.municipality_remarks || null,
  });
  if (error) return { error: friendlyRpcError(error.message) };
  revalidatePath(`/shipments/${d.shipment_id}`);
  return { success: true };
}

const DELIVERY_ORDER_STATUSES = ["Not Required", "Pending", "Requested", "Received", "Uploaded", "Verified"] as const;

const DeliveryOrderSchema = z.object({
  shipment_id: z.string().uuid(),
  carrier_id: z.string().uuid().optional().or(z.literal("")),
  delivery_order_status: z.enum(DELIVERY_ORDER_STATUSES),
  delivery_order_requested_date: z.string().optional(),
  delivery_order_received_date: z.string().optional(),
  delivery_order_doc_uploaded: z.coerce.boolean().optional(),
  delivery_order_responsible: z.string().uuid().optional().or(z.literal("")),
  delivery_order_remarks: z.string().trim().optional(),
});

export async function updateDeliveryOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = DeliveryOrderSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    const fieldErrors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) fieldErrors[k] = v[0];
    return { fieldErrors };
  }
  const supabase = await createClient();
  const d = parsed.data;
  const { error } = await supabase.rpc("update_delivery_order", {
    p_shipment_id: d.shipment_id,
    p_carrier_id: d.carrier_id || null,
    p_delivery_order_status: d.delivery_order_status,
    p_delivery_order_requested_date: d.delivery_order_requested_date || null,
    p_delivery_order_received_date: d.delivery_order_received_date || null,
    p_delivery_order_doc_uploaded: d.delivery_order_doc_uploaded ?? false,
    p_delivery_order_responsible: d.delivery_order_responsible || null,
    p_delivery_order_remarks: d.delivery_order_remarks || null,
  });
  if (error) return { error: friendlyRpcError(error.message) };
  revalidatePath(`/shipments/${d.shipment_id}`);
  return { success: true };
}

const MOFAIC_STATUSES = [
  "Not Applicable", "Applicability Review", "Pending", "Payment Due", "Paid", "Overdue", "Completed", "Exception",
] as const;

const MofaicSchema = z.object({
  shipment_id: z.string().uuid(),
  mofaic_status: z.enum(MOFAIC_STATUSES),
  mofaic_ref: z.string().trim().optional(),
  mofaic_payment_amount: z.coerce.number().optional(),
  mofaic_currency: z.string().trim().optional(),
  mofaic_payment_date: z.string().optional(),
  mofaic_responsible: z.string().uuid().optional().or(z.literal("")),
  mofaic_remarks: z.string().trim().optional(),
});

export async function updateMofaicAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = MofaicSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    const fieldErrors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) fieldErrors[k] = v[0];
    return { fieldErrors };
  }
  const supabase = await createClient();
  const d = parsed.data;
  const { error } = await supabase.rpc("update_mofaic", {
    p_shipment_id: d.shipment_id,
    p_mofaic_status: d.mofaic_status,
    p_mofaic_ref: d.mofaic_ref || null,
    p_mofaic_payment_amount: d.mofaic_payment_amount ?? null,
    p_mofaic_currency: d.mofaic_currency || null,
    p_mofaic_payment_date: d.mofaic_payment_date || null,
    p_mofaic_responsible: d.mofaic_responsible || null,
    p_mofaic_remarks: d.mofaic_remarks || null,
  });
  if (error) return { error: friendlyRpcError(error.message) };
  revalidatePath(`/shipments/${d.shipment_id}`);
  return { success: true };
}

const PHYSICAL_DOC_STATUSES = [
  "Not Required", "Originals Pending", "Ready for Dispatch", "Dispatched",
  "In Transit", "Delivered", "Proof of Delivery Received", "Closed",
] as const;

const PhysicalDocsSchema = z.object({
  shipment_id: z.string().uuid(),
  physical_doc_status: z.enum(PHYSICAL_DOC_STATUSES),
  originals_required: z.coerce.boolean().optional(),
  originals_received: z.coerce.boolean().optional(),
  ready_for_dispatch: z.coerce.boolean().optional(),
  courier_company_id: z.string().uuid().optional().or(z.literal("")),
  tracking_number: z.string().trim().optional(),
  dispatch_date: z.string().optional(),
  delivered_date: z.string().optional(),
  pod_received: z.coerce.boolean().optional(),
  physical_docs_responsible: z.string().uuid().optional().or(z.literal("")),
  physical_docs_remarks: z.string().trim().optional(),
});

export async function updatePhysicalDocumentsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = PhysicalDocsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    const fieldErrors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) fieldErrors[k] = v[0];
    return { fieldErrors };
  }
  const supabase = await createClient();
  const d = parsed.data;
  const { error } = await supabase.rpc("update_physical_documents", {
    p_shipment_id: d.shipment_id,
    p_physical_doc_status: d.physical_doc_status,
    p_originals_required: d.originals_required ?? true,
    p_originals_received: d.originals_received ?? false,
    p_ready_for_dispatch: d.ready_for_dispatch ?? false,
    p_courier_company_id: d.courier_company_id || null,
    p_tracking_number: d.tracking_number || null,
    p_dispatch_date: d.dispatch_date || null,
    p_delivered_date: d.delivered_date || null,
    p_pod_received: d.pod_received ?? false,
    p_physical_docs_responsible: d.physical_docs_responsible || null,
    p_physical_docs_remarks: d.physical_docs_remarks || null,
  });
  if (error) return { error: friendlyRpcError(error.message) };
  revalidatePath(`/shipments/${d.shipment_id}`);
  return { success: true };
}
