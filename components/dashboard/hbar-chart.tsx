import { EmptyChartState } from "@/components/dashboard/bar-chart";

/** Direct port of the prototype's svgHBarChart(). */
export function HBarChart({
  data, color = "var(--color-primary)", emptyMessage = "No data yet.",
}: {
  data: { label: string; value: number; color?: string }[];
  color?: string;
  emptyMessage?: string;
}) {
  if (data.length === 0) return <EmptyChartState height={80} message={emptyMessage} />;

  const width = 340;
  const rowH = 20;
  const pad = 110;
  const height = data.length * rowH + 16;
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
      {data.map((d, i) => {
        const y = i * rowH + 8;
        const barW = (d.value / max) * (width - pad - 30);
        return (
          <g key={d.label}>
            <text x={0} y={y + 11} fontSize={9.5} fill="var(--color-ink)">
              {d.label}
            </text>
            <rect x={pad} y={y} width={barW} height={13} rx={3} fill={d.color ?? color}>
              <title>{d.label}: {d.value}</title>
            </rect>
            <text x={pad + barW + 6} y={y + 11} fontSize={9.5} fill="var(--color-ink-muted)">
              {d.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
