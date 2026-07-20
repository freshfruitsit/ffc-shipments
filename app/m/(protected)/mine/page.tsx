import { createClient } from "@/lib/supabase/server";
import { ShipmentCard, type ShipmentCardData } from "@/components/pwa/shipment-card";
import { PlaneTakeoff } from "lucide-react";

export default async function MyShipmentsPage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("search_shipments", { p_view: "mine", p_page: 1, p_page_size: 50 });
  const shipments: ShipmentCardData[] = (data ?? []).map((row) => ({
    id: row.id, ref: row.ref, supplier_name_snapshot: row.supplier_name_snapshot,
    overall_status: row.overall_status, eta: row.eta, port: row.port,
  }));

  return (
    <div className="px-4 pt-6">
      <p className="font-display text-[11px] font-semibold uppercase tracking-wide text-primary-dark">FFC Field</p>
      <h1 className="font-display text-2xl font-semibold text-ink">My Shipments</h1>
      <p className="mt-0.5 text-[12.5px] text-ink-muted">Everything currently assigned to you.</p>

      <div className="mt-4 space-y-2.5">
        {shipments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <PlaneTakeoff className="h-8 w-8 text-primary/40" strokeWidth={1.5} />
            <p className="text-sm text-ink-muted">Nothing&apos;s assigned to you right now.</p>
          </div>
        ) : (
          shipments.map((s) => <ShipmentCard key={s.id} shipment={s} />)
        )}
      </div>
    </div>
  );
}
