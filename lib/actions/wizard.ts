"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyRpcError } from "@/lib/actions/errors";

export type WizardStepState = { error?: string; success?: boolean };

const InvoiceRowSchema = z.object({
  invoice_no: z.string().trim().min(1, "Invoice number is required"),
  invoice_date: z.string().min(1, "Invoice date is required"),
  supplier: z.string().trim().optional(),
  invoice_value: z.coerce.number().min(0, "Invoice value cannot be negative"),
  currency_code: z.string().trim().min(1),
  payment_terms: z.string().trim().optional(),
  remarks: z.string().trim().optional(),
});

/**
 * The wizard's Invoices step supports multiple rows (unlike the detail
 * page's one-at-a-time Invoices tab) — inserts each row via the same
 * add_invoice RPC, isolating one row's failure from the rest so a single
 * malformed row doesn't lose every other invoice the user already filled in.
 */
export async function addInvoicesBatchAction(
  shipmentId: string,
  rows: Array<z.infer<typeof InvoiceRowSchema>>
): Promise<WizardStepState & { rowErrors?: string[] }> {
  if (rows.length === 0) {
    return { success: true };
  }

  const supabase = await createClient();
  const { data: shipment } = await supabase.from("shipments").select("supplier_name_snapshot, supplier_id").eq("id", shipmentId).single();

  const rowErrors: string[] = [];
  for (const row of rows) {
    const parsed = InvoiceRowSchema.safeParse(row);
    if (!parsed.success) {
      rowErrors.push(parsed.error.issues[0]?.message ?? "Invalid invoice row");
      continue;
    }
    const d = parsed.data;
    const { error } = await supabase.rpc("add_invoice", {
      p_shipment_id: shipmentId,
      p_invoice_no: d.invoice_no,
      p_invoice_date: d.invoice_date,
      p_supplier_id: shipment?.supplier_id ?? null,
      p_supplier_name: d.supplier || shipment?.supplier_name_snapshot || null,
      p_invoice_value: d.invoice_value,
      p_currency_code: d.currency_code,
      p_payment_terms: d.payment_terms || null,
      p_remarks: d.remarks || null,
    });
    if (error) rowErrors.push(friendlyRpcError(error.message));
  }

  revalidatePath(`/shipments/${shipmentId}/invoices`);
  if (rowErrors.length > 0) {
    return { error: `${rowErrors.length} invoice row(s) couldn't be saved: ${rowErrors.join("; ")}`, rowErrors };
  }
  return { success: true };
}
