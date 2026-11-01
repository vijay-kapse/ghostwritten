import { badgeColor } from "./format";

const LABEL = "ghostwritten";

// Rough Verdana 11px advance widths: good enough for badge sizing without a font file.
function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    if ("il|.,:;'! ".includes(ch)) w += 3.6;
    else if ("fjrt".includes(ch)) w += 4.8;
    else if ("mwMW%".includes(ch)) w += 10.2;
    else if (ch >= "A" && ch <= "Z") w += 7.6;
    else w += 6.5;
  }
  return Math.ceil(w);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Flat shields-style badge: `ghostwritten | 23% AI`. */
export function badgeSvg(value: string, color: string): string {
  const lw = textWidth(LABEL) + 12;
  const rw = textWidth(value) + 12;
  const w = lw + rw;
  const title = `${LABEL}: ${value}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient><clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath><g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#24262d"/><rect x="${lw}" width="${rw}" height="20" fill="${color}"/><rect width="${w}" height="20" fill="url(#s)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="${lw / 2}" y="15" fill="#010101" fill-opacity=".3">${LABEL}</text><text x="${lw / 2}" y="14">${LABEL}</text><text x="${lw + rw / 2}" y="15" fill="#010101" fill-opacity=".3">${esc(value)}</text><text x="${lw + rw / 2}" y="14">${esc(value)}</text></g></svg>`;
}

export function shareBadge(share: number, pctText: string): string {
  return badgeSvg(`${pctText} AI`, badgeColor(share));
}

export const UNAVAILABLE_COLOR = "#7b8088";
