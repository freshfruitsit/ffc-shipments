import { z } from "zod";

export const CreateShipmentSchema = z.object({
  mode: z.string().default("Air"),
  branch_id: z.string().uuid("Select a branch"),
  category_id: z.string().uuid().optional().or(z.literal("")),
  supplier_id: z.string().uuid().optional().or(z.literal("")),
  supplier_name: z.string().trim().optional(),
  origin_country_id: z.string().uuid().optional().or(z.literal("")),
  shipment_date: z.string().min(1, "Shipment date is required"),
  // The prototype's Basic Info step doesn't collect Priority at all — the
  // RPC itself defaults to 'Medium' when omitted, so this stays optional
  // rather than forcing a field the wizard's own design doesn't show.
  priority: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
  responsible: z.string().uuid("Select a responsible user"),
  internal_ref: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export const AddSupplierSchema = z.object({
  name: z.string().trim().min(2, "Supplier name must be at least 2 characters"),
});
