import { OVERALL_STAGE_FLOW, overallStageIndex } from "@/lib/prototype-constants";
import { formatDubaiDate } from "@/lib/dates";

/**
 * Item (screenshot audit): this used to show a hardcoded date-or-"Pending"
 * sub-label under every stage, driven ONLY by overall_status — so even
 * after a user genuinely updated Customs Status to "Submitted" elsewhere,
 * the "Submitted" stage here still just said "Pending", because it had
 * no idea Customs Status existed at all. Fixed by mapping each stage to
 * its actual, real, corresponding subprocess status field instead of a
 * generic placeholder — since those fields already default to "Pending"
 * and change the moment a user updates them, this shows exactly what was
 * asked for with no extra logic, just wiring in the real data.
 *
 * Deliberately NOT auto-advancing overallStatus itself from these
 * subprocess changes — that stays a separate, explicit, permission-gated
 * action via "Change Status" (change_shipment_status + status_transitions),
 * so a customs update can never silently bypass that gate.
 */
export function ShipmentStepper({
  overallStatus,
  documentStatus,
  customsStatus,
  municipalityStatus,
  deliveryOrderStatus,
  physicalDocStatus,
  createdAt,
}: {
  overallStatus: string;
  documentStatus: string;
  customsStatus: string;
  municipalityStatus: string;
  deliveryOrderStatus: string;
  physicalDocStatus: string;
  createdAt: string;
}) {
  const currentIdx = overallStageIndex(overallStatus, physicalDocStatus);

  // One real subprocess status per stage — not every stage has a clean
  // 1:1 subprocess mapping (there are 8 stages but 6 subprocess fields),
  // so "Submitted" and "Customs Processing" both reflect customsStatus:
  // that field's own lifecycle (Pending -> Submitted -> Declaration
  // Created -> Under Review -> Approved) genuinely spans both stages,
  // and showing the same live value in both is accurate, not redundant.
  const stageSubLabel: Record<number, string> = {
    0: formatDubaiDate(createdAt),
    1: documentStatus,
    2: customsStatus,
    3: customsStatus,
    4: municipalityStatus,
    5: deliveryOrderStatus,
    6: physicalDocStatus,
    7: overallStatus === "Completed" ? "Completed" : "Pending",
  };

  return (
    <div className="mt-3 flex justify-between gap-1 overflow-x-auto pb-1.5">
      {OVERALL_STAGE_FLOW.map((stage, i) => {
        const done = i < currentIdx;
        const current = i === currentIdx;
        return (
          <div key={stage} className="relative min-w-[100px] flex-1 text-center">
            {i < OVERALL_STAGE_FLOW.length - 1 && (
              <div
                className={`absolute left-[55%] top-[11px] h-0.5 w-[90%] ${done ? "bg-primary" : "bg-border"}`}
              />
            )}
            <div
              className={`relative z-10 mx-auto mb-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] font-bold text-white ${
                done ? "bg-primary" : current ? "bg-info" : "bg-border"
              }`}
            >
              {done ? "✓" : i + 1}
            </div>
            <div className="text-[10.5px] font-semibold text-ink">{stage}</div>
            <div className="text-[9.5px] text-ink-muted">{stageSubLabel[i] ?? "Pending"}</div>
          </div>
        );
      })}
    </div>
  );
}
