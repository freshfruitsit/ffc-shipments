"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDubaiDate, formatDubaiDateTime, formatMoney } from "@/lib/dates";

type ReviewData = {
  shipment_date: string; mode: string; supplier_name_snapshot: string; priority: string;
  awb: string | null; flight: string | null; eta: string | null; net_weight: number | null; gross_weight: number | null;
  declaration_no: string | null; municipality_draft_ref: string | null; municipality_submitted_ref: string | null;
  carrier_id: string | null; delivery_order_status: string; mofaic_status: string;
  invoiceCount: number; invoiceTotalAED: number; documentCount: number; portName: string; airlineName: string;
};

export function Step8Review({
  shipmentId,
  shipmentRef,
  onBack,
  onFinish,
}: {
  shipmentId: string;
  shipmentRef: string;
  onBack: () => void;
  onFinish: () => void;
}) {
  const [data, setData] = useState<ReviewData | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const [{ data: shipment }, { data: invoices }, { count: documentCount }] = await Promise.all([
        supabase
          .from("shipments")
          .select(
            "shipment_date, mode, supplier_name_snapshot, priority, awb, flight, eta, net_weight, gross_weight, declaration_no, municipality_draft_ref, municipality_submitted_ref, carrier_id, delivery_order_status, mofaic_status, airline_id, port_id"
          )
          .eq("id", shipmentId)
          .single(),
        supabase.from("invoices").select("invoice_value, currency_code").eq("shipment_id", shipmentId),
        supabase.from("documents").select("*", { count: "exact", head: true }).eq("shipment_id", shipmentId),
      ]);
      if (!shipment) return;

      const [{ data: airline }, { data: port }, { data: rates }] = await Promise.all([
        shipment.airline_id ? supabase.from("airlines").select("name").eq("id", shipment.airline_id).single() : Promise.resolve({ data: null }),
        shipment.port_id ? supabase.from("ports").select("name").eq("id", shipment.port_id).single() : Promise.resolve({ data: null }),
        supabase.from("fx_rates").select("currency_code, rate_to_aed").order("effective_date", { ascending: false }),
      ]);
      const rateByCurrency = new Map<string, number>();
      for (const r of rates ?? []) if (!rateByCurrency.has(r.currency_code)) rateByCurrency.set(r.currency_code, r.rate_to_aed);
      const invoiceTotalAED = (invoices ?? []).reduce(
        (sum, inv) => sum + inv.invoice_value * (inv.currency_code === "AED" ? 1 : rateByCurrency.get(inv.currency_code) ?? 0),
        0
      );

      setData({
        ...shipment,
        invoiceCount: invoices?.length ?? 0,
        invoiceTotalAED,
        documentCount: documentCount ?? 0,
        portName: port?.name ?? "—",
        airlineName: airline?.name ?? "—",
      });
    })();
  }, [shipmentId]);

  if (!data) {
    return <p className="py-8 text-center text-sm text-ink-muted">Loading summary…</p>;
  }

  return (
    <div>
      <p className="mb-4 text-sm text-ink-muted">
        Review the details below for <strong className="text-ink">{shipmentRef}</strong>, then finish — you can
        still edit everything from the shipment&apos;s detail page afterward.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ReviewBlock title="Basic Information">
          <ReviewLine label="Shipment Date" value={formatDubaiDate(data.shipment_date)} />
          <ReviewLine label="Mode" value={data.mode} />
          <ReviewLine label="Supplier" value={data.supplier_name_snapshot} />
          <ReviewLine label="Priority" value={data.priority} />
        </ReviewBlock>

        <ReviewBlock title="Transport">
          <ReviewLine label="AWB" value={data.awb ?? "—"} />
          <ReviewLine label="Airline" value={data.airlineName} />
          <ReviewLine label="Flight" value={data.flight ?? "—"} />
          <ReviewLine label="ETA" value={data.eta ? formatDubaiDateTime(data.eta) : "—"} />
          <ReviewLine label="Port" value={data.portName} />
          <ReviewLine label="Net / Gross Weight" value={`${data.net_weight ?? "—"} / ${data.gross_weight ?? "—"} kg`} />
        </ReviewBlock>

        <ReviewBlock title="Invoices">
          <ReviewLine label="Number of Invoices" value={data.invoiceCount.toString()} />
          <ReviewLine label="Illustrative AED Total" value={formatMoney(Math.round(data.invoiceTotalAED), "AED")} />
        </ReviewBlock>

        <ReviewBlock title="Dubai Customs / Municipality">
          <ReviewLine label="Declaration Number" value={data.declaration_no ?? "—"} />
          <ReviewLine label="Municipality Draft Ref" value={data.municipality_draft_ref ?? "—"} />
          <ReviewLine label="Municipality Submitted Ref" value={data.municipality_submitted_ref ?? "—"} />
        </ReviewBlock>

        <ReviewBlock title="Delivery Order / MOFAIC">
          <ReviewLine label="Delivery Order Status" value={data.delivery_order_status} />
          <ReviewLine label="MOFAIC Status" value={data.mofaic_status} />
          <ReviewLine label="MOFAIC Applicable" value={data.invoiceTotalAED > 10000 ? "Yes" : "No"} />
        </ReviewBlock>

        <ReviewBlock title="Documents">
          <ReviewLine label="Files Uploaded" value={data.documentCount.toString()} />
        </ReviewBlock>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
        <div />
        <div className="flex gap-2">
          <button type="button" onClick={onBack} className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted">
            Back
          </button>
          <button type="button" onClick={onFinish} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">
            Go to Shipment
          </button>
        </div>
      </div>
    </div>
  );
}

function ReviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</h4>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[12.5px]">
      <span className="text-ink-muted">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}
