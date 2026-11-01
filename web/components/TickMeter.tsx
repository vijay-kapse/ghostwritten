/**
 * A tally strip: n ticks, filled left to right in proportion to `share`.
 * Used for the headline (100 ticks) and inside table rows (20 ticks, one per 5 points).
 */
export function TickMeter({
  share,
  n = 20,
  height = 14,
  animate = false,
  label,
  className = "",
}: {
  share: number;
  n?: number;
  height?: number;
  animate?: boolean;
  label?: string;
  className?: string;
}) {
  const exact = Math.max(0, Math.min(1, share)) * n;
  const full = Math.floor(exact);
  const frac = exact - full;
  const step = 10;
  const w = n * step;
  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      className={`${animate ? "tick-fill" : ""} ${className}`}
      width="100%"
      height={height}
      role="img"
      aria-label={label ?? `${(share * 100).toFixed(1)} percent`}
    >
      {Array.from({ length: n }, (_, i) => {
        const on = i < full;
        const partial = i === full && frac > 0.02;
        return (
          <rect
            key={i}
            x={i * step + 1}
            width={step - 2.5}
            y={0}
            height={height}
            data-on={on || partial ? 1 : 0}
            style={{ ["--i" as string]: i }}
            fill={on ? "var(--accent)" : partial ? "var(--accent)" : "var(--rule)"}
            fillOpacity={partial ? 0.35 + 0.65 * frac : 1}
          />
        );
      })}
    </svg>
  );
}
