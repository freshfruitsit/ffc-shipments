import { OVERALL_STAGE_FLOW, overallStageIndex } from "@/lib/prototype-constants";
import { formatDubaiDate } from "@/lib/dates";

/**
 * overall_status is now fully automatic — derived by
 * fn_recalculate_shipment_progress from the 6 module statuses (see
 * 20260101000025_auto_status_progression.sql). There's no more separate
 * "Change Status" action to keep in sync with what this stepper shows;
 * overall_status IS one of these 8 stage names directly, so the stepper
 * simply reflects it. Each stage also shows its own real, live
 * subprocess status underneath — since the stages are now literally
 * named after the field driving them (Dubai Customs / customs_status,
 * Dubai Municipality / municipality_status, etc.), that mapping is
 * direct rather than approximate.
 */
export function ShipmentStepper({
  overallStatus,
  customsStatus,
  deliveryOrderStatus,
  municipalityStatus,
  mofaicStatus,
  physicalDocStatus,
  createdAt,
}: {
  overallStatus: string;
  documentStatus: string;
  customsStatus: string;
  municipalityStatus: string;
  deliveryOrderStatus: string;
  mofaicStatus: string;
  physicalDocStatus: string;
  createdAt: string;
}) {
  const currentIdx = overallStageIndex(overallStatus);

  const stageSubLabel: Record<number, string> = {
    0: formatDubaiDate(createdAt),
    1: customsStatus,
    2: deliveryOrderStatus,
    3: municipalityStatus,
    // "Documents at FFC HO" (stage 4) is driven by the originals_received
    // boolean, not a status enum — this isn't passed as its own prop
    // since the stage's own position already tells the same story: once
    // this stage has genuinely been reached or passed, the underlying
    // flag was true.
    4: currentIdx >= 4 ? "Received" : "Pending",
    5: mofaicStatus,
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
