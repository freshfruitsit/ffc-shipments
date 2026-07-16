/**
 * Hand-rolled SVG bar chart — a direct port of the prototype's
 * svgBarChart() function (ffc2/index_final.html), not a new design.
 * Kept dependency-free (no chart library) to match this project's existing
 * performance-conscious bundle-size ethos (see the Module 2 performance
 * pass) and because the prototype's own chart was this simple to begin
 * with — pulling in a full charting library for six bars would be a net
 * regression, not an improvement.
 */
export function BarChart({
  data,
  height = 190,
  color = "var(--color-primary)",
}: {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  color?: string;
}) {
  const width = 360;
  const pad = 30;
  const max = Math.max(...data.map((d) => d.value), 1);
  const bw = (width - pad * 1.5) / Math.max(data.length, 1);

  if (data.length === 0 || data.every((d) => d.value === 0)) {
    return <EmptyChartState height={height} />;
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
      <line x1={pad} y1={height - 30} x2={width - 6} y2={height - 30} stroke="var(--color-border)" />
      {data.map((d, i) => {
        const bh = (d.value / max) * (height - 50);
        const x = pad + i * bw + bw * 0.18;
        const bwid = bw * 0.64;
        const y = height - 30 - bh;
        return (
          <g key={d.label}>
            <rect x={x} y={y} width={bwid} height={bh} rx={3} fill={d.color ?? color}>
              <title>{d.label}: {d.value}</title>
            </rect>
            <text x={x + bwid / 2} y={y - 5} fontSize={9.5} textAnchor="middle" fill="var(--color-ink)" fontWeight={600}>
              {d.value}
            </text>
            <text x={x + bwid / 2} y={height - 14} fontSize={9} textAnchor="middle" fill="var(--color-ink-muted)">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function EmptyChartState({ height = 160, message = "No data yet." }: { height?: number; message?: string }) {
  return (
    <div className="flex items-center justify-center text-sm text-ink-muted" style={{ height }}>
      {message}
    </div>
  );
}
