"use server";

import { createClient } from "@/lib/supabase/server";
import { formatDubaiDate } from "@/lib/dates";
import { SHIPMENT_REPORTS, type ShipmentReportKey } from "@/lib/report-catalog";

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const REPORT_KEYS = new Set(SHIPMENT_REPORTS.map((r) => r.key));

export async function exportReportCsvAction(reportKey: string): Promise<{ csv?: string; error?: string }> {
  if (!REPORT_KEYS.has(reportKey as ShipmentReportKey)) {
    return { error: "Unknown report." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_report_shipments", {
    p_report_key: reportKey,
    p_page: 1,
    p_page_size: 2000,
  });
  if (error) return { error: "Couldn't export this report right now." };

  const headers = [
    "Shipment ID", "Supplier", "Origin Country", "AWB", "ETA", "Overall Status", "Invoice Value", "Currency",
    "Net Weight", "Gross Weight", "MOFAIC Due Date", "MOFAIC Days Left",
  ];
  const rows = (data ?? []).map((s) => [
    s.ref, s.supplier_name_snapshot, s.origin_country ?? "", s.awb ?? "",
    s.eta ? formatDubaiDate(s.eta) : "", s.overall_status, s.invoice_value ?? "", s.currency_code ?? "",
    s.net_weight ?? "", s.gross_weight ?? "", s.mofaic_due_date ?? "", s.mofaic_days_left ?? "",
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  return { csv };
}

export async function exportSupplierPerformanceCsvAction(): Promise<{ csv?: string; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_report_supplier_performance", { p_page: 1, p_page_size: 500 });
  if (error) return { error: "Couldn't export this report right now." };

  const headers = ["Supplier", "Total Shipments", "Completed Shipments", "Open Exceptions", "Avg Days to Complete"];
  const rows = (data ?? []).map((s) => [
    s.supplier_name, s.total_shipments, s.completed_shipments, s.open_exceptions, s.avg_days_to_complete ?? "",
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  return { csv };
}

export async function exportExceptionsCsvAction(params: {
  status?: string;
  severity?: string;
}): Promise<{ csv?: string; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_exceptions", {
    p_status: params.status || null,
    p_severity: params.severity || null,
    p_page: 1,
    p_page_size: 2000,
  });
  if (error) return { error: "Couldn't export the exceptions workspace right now." };

  const headers = ["Shipment", "Severity", "Type", "Description", "Status", "Assigned To", "Due Date", "Resubmissions"];
  const rows = (data ?? []).map((e) => [
    e.shipment_ref, e.severity, e.type_name, e.description, e.status, e.assigned_to_name ?? "", e.due_date ?? "",
    e.resubmission_count,
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  return { csv };
}
