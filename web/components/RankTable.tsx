import Link from "next/link";
import { compact, num, pct } from "@/lib/format";
import { TickMeter } from "./TickMeter";

export interface RankRow {
  key: string;
  label: string;
  href?: string;
  sub?: string;
  ai_share: number;
  ai: number;
  total: number;
}

/** Server-rendered ranking: rank, name, tick meter, share, AI/total commits. */
export function RankTable({ rows, caption, noun }: { rows: RankRow[]; caption: string; noun: string }) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-muted">
        No {noun} have 100 commits in the window yet. The next scan will fill this table.
      </p>
    );
  }
  return (
    <table className="tbl">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th className="rank" scope="col"><span className="sr-only">Rank</span></th>
          <th scope="col">{noun}</th>
          <th scope="col" className="hidden sm:table-cell w-[26%]"><span className="sr-only">Share meter</span></th>
          <th scope="col" className="r">AI share</th>
          <th scope="col" className="r hidden sm:table-cell">AI / total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.key}>
            <td className="rank">{i + 1}</td>
            <td className="font-semibold">
              {r.href ? (
                <Link href={r.href} className="link">{r.label}</Link>
              ) : (
                r.label
              )}
              {r.sub && <span className="block text-[12px] font-normal text-muted">{r.sub}</span>}
            </td>
            <td className="hidden sm:table-cell">
              <TickMeter share={r.ai_share} height={10} label={`${pct(r.ai_share)} of commits`} />
            </td>
            <td className="r font-bold">{pct(r.ai_share)}</td>
            <td className="r hidden sm:table-cell text-muted">
              {compact(r.ai)} / {compact(r.total)}
              <span className="sr-only"> ({num(r.ai)} of {num(r.total)})</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
