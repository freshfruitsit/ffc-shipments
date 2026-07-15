import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { ShipmentTabs } from "@/components/shipments/tabs/shipment-tabs";
import { formatDubaiDate } from "@/lib/dates";

export default async function ShipmentDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: shipment, error } = await supabase
    .from("shipments")
    .select("ref, mode, shipment_date, supplier_name_snapshot, overall_status")
    .eq("id", id)
    .single();

  if (error || !shipment) {
    notFound();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">{shipment.ref}</h1>
          <p className="text-sm text-ink-muted">
            {shipment.supplier_name_snapshot} · {shipment.mode} · {formatDubaiDate(shipment.shipment_date)}
          </p>
        </div>
        <StatusBadge status={shipment.overall_status} />
      </div>

      <ShipmentTabs shipmentId={id} />

      <div className="pt-2">{children}</div>
    </div>
  );
}
