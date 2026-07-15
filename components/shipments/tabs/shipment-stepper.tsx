import { OVERALL_STAGE_FLOW, overallStageIndex } from "@/lib/prototype-constants";
import { formatDubaiDate } from "@/lib/dates";

export function ShipmentStepper({
  overallStatus,
  physicalDocStatus,
  lastUpdated,
}: {
  overallStatus: string;
  physicalDocStatus: string;
  lastUpdated: string;
}) {
  const currentIdx = overallStageIndex(overallStatus, physicalDocStatus);

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
            <div className="text-[9.5px] text-ink-muted">{i <= currentIdx ? formatDubaiDate(lastUpdated) : "Pending"}</div>
          </div>
        );
      })}
    </div>
  );
}
