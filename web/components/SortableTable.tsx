"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { num, pct } from "@/lib/format";
import { TickMeter } from "./TickMeter";

export interface Col<T> {
  key: keyof T & string;
  label: string;
  numeric?: boolean;
  /** Render a link around the cell text. */
  href?: (row: T) => string;
  format?: (v: T[keyof T], row: T) => React.ReactNode;
  hideOnMobile?: boolean;
}

const PAGE = 100;

export function SortableTable<T extends { total: number }>({
  rows,
  cols,
  rowKey,
  caption,
  minCommits,
  noun,
}: {
  rows: T[];
  cols: Col<T>[];
  rowKey: (r: T) => string;
  caption: string;
  minCommits: number;
  noun: string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "ai_share", dir: -1 });
  const [shown, setShown] = useState(PAGE);

  const view = useMemo(() => {
    const f = rows.filter((r) => r.total >= minCommits);
    const k = sort.key as keyof T;
    return f.sort((a, b) => {
      const av = a[k], bv = b[k];
      const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""));
      return c * sort.dir || String(a[cols[0].key]).localeCompare(String(b[cols[0].key]));
    });
  }, [rows, minCommits, sort, cols]);

  function toggle(c: Col<T>) {
    setShown(PAGE);
    setSort((s) => (s.key === c.key ? { key: c.key, dir: (s.dir * -1) as 1 | -1 } : { key: c.key, dir: c.numeric ? -1 : 1 }));
  }

  if (view.length === 0) {
    return (
      <p className="py-6 text-muted">
        No {noun} have {num(minCommits)} or more commits in the window. Lower the minimum above to widen the table.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th className="rank" scope="col"><span className="sr-only">Rank</span></th>
            {cols.map((c) => {
              const active = sort.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={`${c.numeric ? "r" : ""} ${c.hideOnMobile ? "hidden sm:table-cell" : ""}`}
                  aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                >
                  <button type="button" onClick={() => toggle(c)}>
                    {c.label}
                    <span aria-hidden="true" className="inline-block w-[1ch]">{active ? (sort.dir === 1 ? "↑" : "↓") : ""}</span>
                  </button>
                </th>
              );
            })}
            <th scope="col" className="hidden md:table-cell w-[16%]"><span className="sr-only">Share meter</span></th>
          </tr>
        </thead>
        <tbody>
          {view.slice(0, shown).map((r, i) => (
            <tr key={rowKey(r)}>
              <td className="rank">{i + 1}</td>
              {cols.map((c) => {
                const v = r[c.key];
                const text = c.format ? c.format(v, r) : typeof v === "number" ? num(v) : String(v ?? "");
                return (
                  <td
                    key={c.key}
                    className={`${c.numeric ? "r" : ""} ${c.hideOnMobile ? "hidden sm:table-cell" : ""} ${c === cols[0] ? "font-semibold" : ""}`}
                  >
                    {c.href ? <Link href={c.href(r)} className="link">{text}</Link> : text}
                  </td>
                );
              })}
              <td className="hidden md:table-cell">
                <TickMeter share={(r as unknown as { ai_share: number }).ai_share} height={9} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pt-3 flex items-center gap-4 text-sm text-muted">
        <span>Showing {Math.min(shown, view.length)} of {num(view.length)}</span>
        {shown < view.length && (
          <button type="button" className="btn ghost" onClick={() => setShown((s) => s + PAGE)}>
            Show {Math.min(PAGE, view.length - shown)} more
          </button>
        )}
      </div>
    </div>
  );
}

export const shareCol = { key: "ai_share" as const, label: "AI share", numeric: true, format: (v: unknown) => <b>{pct(v as number)}</b> };
