import { EmptyChartState } from "@/components/dashboard/bar-chart";

const DEFAULT_PALETTE = [
  "var(--color-primary)", "var(--color-info)", "var(--color-warning)", "var(--color-danger)",
  "var(--color-ink-muted)", "#58c98a", "#94a3b8", "#a78bfa",
];

/** Direct port of the prototype's svgDonut(). */
export function DonutChart({
  data, size = 160,
}: {
  data: { label: string; value: number; color?: string }[];
  size?: number;
}) {
  const total = data.reduce((a, b) => a + b.value, 0);
  if (total === 0) return <EmptyChartState height={size} />;

  const r = size / 2 - 8;
  const cx = size / 2;
  const cy = size / 2;
  let angle = -90;
  const slices: { path: string; color: string; label: string; value: number }[] = [];

  data.forEach((d, i) => {
    const frac = d.value / total;
    const sweep = frac * 360;
    const x1 = cx + r * Math.cos((angle * Math.PI) / 180);
    const y1 = cy + r * Math.sin((angle * Math.PI) / 180);
    const end = angle + sweep;
    const x2 = cx + r * Math.cos((end * Math.PI) / 180);
    const y2 = cy + r * Math.sin((end * Math.PI) / 180);
    const largeArc = sweep > 180 ? 1 : 0;
    slices.push({
      path: `M${cx} ${cy} L${x1} ${y1} A${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`,
      color: d.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length],
      label: d.label,
      value: d.value,
    });
    angle = end;
  });

  const inner = r * 0.55;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color}>
            <title>{s.label}: {s.value}</title>
          </path>
        ))}
        <circle cx={cx} cy={cy} r={inner} fill="var(--color-surface)" />
      </svg>
      <div>
        {slices.map((s, i) => (
          <div key={i} className="mt-1 flex items-center gap-1.5 text-[10.5px]">
            <span className="inline-block h-[9px] w-[9px] rounded-sm" style={{ background: s.color }} />
            {s.label} ({s.value})
          </div>
        ))}
      </div>
    </div>
  );
}
