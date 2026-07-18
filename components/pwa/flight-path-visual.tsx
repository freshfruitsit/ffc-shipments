import { OVERALL_STAGE_FLOW, overallStageIndex } from "@/lib/prototype-constants";

/**
 * The PWA's one deliberate signature moment — a route line with a plane
 * marking the shipment's real current position, styled after flight-
 * tracker apps (FlightRadar24 and similar). Not a generic progress bar:
 * this is literally what an air-freight shipment does, so the domain's
 * own visual language is the honest choice here, not a decoration
 * borrowed from somewhere else. Completed stages get a solid route line;
 * the road ahead is dashed. Everything else on this screen stays quiet
 * on purpose so this is the one thing that stands out.
 */
export function FlightPathVisual({
  overallStatus,
  physicalDocStatus,
}: {
  overallStatus: string;
  physicalDocStatus: string;
}) {
  const currentIdx = overallStageIndex(overallStatus, physicalDocStatus);
  const total = OVERALL_STAGE_FLOW.length;
  const pad = 16;
  const width = 358;
  const trackWidth = width - pad * 2;
  const y = 28;

  const stopX = (i: number) => pad + (trackWidth * i) / (total - 1);
  const planeX = stopX(currentIdx);

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <svg viewBox={`0 0 ${width} 56`} className="w-full" aria-hidden="true">
        {/* Route line: solid green for the distance already covered, dashed for what's ahead */}
        <line x1={pad} y1={y} x2={stopX(total - 1)} y2={y} stroke="var(--color-border)" strokeWidth={2} strokeDasharray="1 5" strokeLinecap="round" />
        <line x1={pad} y1={y} x2={planeX} y2={y} stroke="var(--color-primary)" strokeWidth={2.5} strokeLinecap="round" />

        {/* Waypoint dots */}
        {OVERALL_STAGE_FLOW.map((stage, i) => {
          const done = i < currentIdx;
          const current = i === currentIdx;
          return (
            <circle
              key={stage}
              cx={stopX(i)}
              cy={y}
              r={current ? 5 : 3.5}
              fill={done || current ? "var(--color-primary)" : "var(--color-surface)"}
              stroke={done || current ? "var(--color-primary)" : "var(--color-border)"}
              strokeWidth={1.5}
            >
              <title>{stage}</title>
            </circle>
          );
        })}

        {/* The plane — gently pulsing at the current waypoint */}
        <g transform={`translate(${planeX} ${y - 15})`}>
          <circle r={11} fill="var(--color-primary)" opacity="0.16">
            <animate attributeName="r" values="10;15;10" dur="2.2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.18;0.05;0.18" dur="2.2s" repeatCount="indefinite" />
          </circle>
          <g transform="rotate(90)" fill="var(--color-primary-dark)">
            <path d="M0 -7 L2.2 -1.5 L7.5 0 L2.2 1.5 L1.3 5.5 L2.8 7.5 L0.6 7 L0 9 L-0.6 7 L-2.8 7.5 L-1.3 5.5 L-2.2 1.5 L-7.5 0 L-2.2 -1.5 Z" />
          </g>
        </g>
      </svg>

      <p className="mt-1 text-center">
        <span className="font-display text-[13px] font-semibold text-ink">
          {OVERALL_STAGE_FLOW[currentIdx] ?? overallStatus}
        </span>
        <span className="ml-1.5 text-[11px] text-ink-muted">
          · stage {currentIdx + 1} of {total}
        </span>
      </p>
    </div>
  );
}
