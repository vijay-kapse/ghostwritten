"use client";

import { useEffect, useRef, useState } from "react";
import { monthLabel, num, pct } from "@/lib/format";

export interface MonthPoint {
  month: string;
  total: number;
  ai: number;
}

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return n * p;
}

const ticks = (max: number, n = 4) => Array.from({ length: n + 1 }, (_, i) => (max / n) * i);
const axisNum = (v: number) =>
  v >= 1_000_000 ? `${+(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(Math.round(v));

/**
 * Hand-drawn SVG, no chart library.
 * trend: grey bar = all commits, violet bar = AI commits, ink line = AI share (right axis).
 * stack: one stacked bar per month, human below, AI on top.
 */
export function MonthChart({
  points,
  variant,
  caption,
}: {
  points: MonthPoint[];
  variant: "trend" | "stack";
  caption: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = points.length;
  if (n === 0) return <p className="py-6 text-muted">No monthly data yet.</p>;

  const trend = variant === "trend";
  const small = width < 520;
  const H = small ? 250 : 320;
  const M = { t: 10, r: trend ? (small ? 38 : 52) : 8, b: 34, l: small ? 36 : 46 };
  const pw = width - M.l - M.r;
  const ph = H - M.t - M.b;
  const band = pw / n;
  const bw = Math.max(2, Math.min(band * 0.74, 44));

  const maxV = niceCeil(Math.max(...points.map((p) => p.total), 1));
  const y = (v: number) => M.t + ph - (v / maxV) * ph;
  const shares = points.map((p) => (p.total ? p.ai / p.total : 0));
  // Right-axis maxima divisible by four, so its ticks land on the left axis gridlines at round percentages.
  const need = Math.max(...shares, 0.01) * 1.08;
  const maxS = [0.04, 0.08, 0.12, 0.2, 0.4, 0.6, 0.8, 1].find((m) => m >= need) ?? 1;
  const ys = (s: number) => M.t + ph - (s / maxS) * ph;
  const cx = (i: number) => M.l + band * i + band / 2;

  const every = Math.max(1, Math.ceil(46 / band));
  const line = shares.map((s, i) => `${i ? "L" : "M"}${cx(i).toFixed(1)},${ys(s).toFixed(1)}`).join(" ");
  const active = hover ?? n - 1;
  const ap = points[active];
  const ash = shares[active];

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * width - M.l;
    setHover(Math.max(0, Math.min(n - 1, Math.floor(x / band))));
  };

  return (
    <figure ref={wrap} className="w-full">
      <figcaption className="sr-only">{caption}</figcaption>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 pb-2 min-h-[2.6rem]" aria-live="polite">
        <span className="font-bold cond text-lg">{monthLabel(ap.month)}</span>
        <span>
          <b>{num(ap.total)}</b> commits
        </span>
        <span style={{ color: "var(--accent)" }} className="font-bold">
          {num(ap.ai)} by AI
        </span>
        <span className="font-bold">{pct(ash)} AI share</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${H}`}
        width={width}
        height={H}
        className="block w-full touch-pan-y"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        aria-hidden="true"
      >
        {ticks(maxV).map((t) => (
          <g key={t}>
            <line x1={M.l} x2={width - M.r} y1={y(t)} y2={y(t)} stroke="var(--rule)" strokeWidth={t === 0 ? 1.5 : 1} />
            <text x={M.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
              {axisNum(t)}
            </text>
          </g>
        ))}
        {trend &&
          ticks(maxS).slice(1).map((t) => (
            <text key={t} x={width - M.r + 6} y={ys(t) + 4} fontSize="11" fill="var(--ink)">
              {Math.round(t * 100)}%
            </text>
          ))}
        {hover !== null && (
          <rect x={M.l + band * hover} y={M.t} width={band} height={ph} fill="var(--paper-2)" />
        )}
        {points.map((p, i) => {
          const human = Math.max(0, p.total - p.ai);
          return (
            <g key={p.month}>
              {trend ? (
                <>
                  <rect x={cx(i) - bw / 2} y={y(p.total)} width={bw} height={y(0) - y(p.total)} fill="var(--human)" />
                  <rect x={cx(i) - bw / 2} y={y(p.ai)} width={bw} height={y(0) - y(p.ai)} fill="var(--accent)" />
                </>
              ) : (
                <>
                  <rect x={cx(i) - bw / 2} y={y(human)} width={bw} height={y(0) - y(human)} fill="var(--human)" />
                  <rect
                    x={cx(i) - bw / 2}
                    y={y(human + p.ai)}
                    width={bw}
                    height={y(human) - y(human + p.ai)}
                    fill="var(--accent)"
                  />
                </>
              )}
              {i % every === 0 && (
                <text x={cx(i)} y={H - 16} textAnchor="middle" fontSize="11" fill="var(--muted)">
                  {monthLabel(p.month, false)}
                </text>
              )}
              {i % every === 0 && (p.month.endsWith("-01") || i === 0) && (
                <text x={cx(i)} y={H - 3} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--ink)">
                  {p.month.slice(0, 4)}
                </text>
              )}
            </g>
          );
        })}
        {trend && (
          <>
            <path d={line} fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
            <circle cx={cx(active)} cy={ys(ash)} r="4.5" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2" />
          </>
        )}
      </svg>
      <div className="flex flex-wrap gap-x-5 gap-y-1 pt-2 text-[13px] text-muted">
        {trend ? (
          <>
            <Key color="var(--human)" label="All commits (left axis)" />
            <Key color="var(--accent)" label="AI commits (left axis)" />
            <Key color="var(--ink)" label="AI share (right axis)" line />
          </>
        ) : (
          <>
            <Key color="var(--human)" label="Human commits" />
            <Key color="var(--accent)" label="AI commits" />
          </>
        )}
      </div>
      <div className="sr-only"><table>
        <caption>{caption}</caption>
        <thead>
          <tr><th>Month</th><th>All commits</th><th>AI commits</th><th>AI share</th></tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={p.month}><td>{p.month}</td><td>{p.total}</td><td>{p.ai}</td><td>{pct(shares[i])}</td></tr>
          ))}
        </tbody>
      </table></div>
    </figure>
  );
}

function Key({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="16" height="10" aria-hidden="true">
        {line ? (
          <line x1="0" x2="16" y1="5" y2="5" stroke={color} strokeWidth="2.5" />
        ) : (
          <rect width="16" height="10" fill={color} />
        )}
      </svg>
      {label}
    </span>
  );
}
