export function pct(share: number, digits = 1): string {
  const v = share * 100;
  if (v > 0 && v < 0.1) return "<0.1%";
  return `${v.toFixed(digits)}%`;
}

/** Badge text: whole percent, "<1" for tiny non-zero values. */
export function pctWhole(share: number): string {
  const v = share * 100;
  if (v > 0 && v < 1) return "<1%";
  return `${Math.round(v)}%`;
}

export function num(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function compact(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function signedPoints(delta: number): string {
  const v = delta * 100;
  const s = v >= 0 ? "+" : "−";
  return `${s}${Math.abs(v).toFixed(1)} pts`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function monthLabel(ym: string, withYear = true): string {
  const [y, m] = ym.split("-");
  const name = MONTHS[Number(m) - 1] ?? ym;
  return withYear ? `${name} ${y}` : name;
}

export function dateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function windowLabel(w: string): string {
  const [a, b] = w.split("..");
  if (!b) return w;
  return `${monthLabel(a)} to ${monthLabel(b)}`;
}

/** SCHEMA badge scale: grey <5%, blue <25%, orange <50%, red >=50%. */
export function badgeColor(share: number): string {
  if (share < 0.05) return "#7b8088";
  if (share < 0.25) return "#2f6fdb";
  if (share < 0.5) return "#e8892b";
  return "#d3392f";
}
