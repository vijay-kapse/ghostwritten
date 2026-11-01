"use client";

import { useState } from "react";
import type { LanguageRow, OrgRow, RepoRow } from "@/lib/types";
import { compact, pct } from "@/lib/format";
import { SortableTable, type Col } from "./SortableTable";

const share = <T,>(): Col<T & { ai_share: number }> => ({
  key: "ai_share",
  label: "AI share",
  numeric: true,
  format: (v) => <b>{pct(v as number)}</b>,
});

export function Leaderboards({
  repos,
  orgs,
  languages,
  defaultMin,
}: {
  repos: RepoRow[];
  orgs: OrgRow[];
  languages: LanguageRow[];
  defaultMin: number;
}) {
  const [min, setMin] = useState(defaultMin);

  const repoCols: Col<RepoRow>[] = [
    { key: "repo", label: "Repository", href: (r) => `/r/${r.repo}` },
    { key: "language", label: "Language", hideOnMobile: true, format: (v) => (v as string | null) ?? "" },
    { key: "stars", label: "Stars", numeric: true, hideOnMobile: true, format: (v) => compact(v as number) },
    { key: "ai", label: "AI commits", numeric: true, hideOnMobile: true },
    { key: "total", label: "All commits", numeric: true, hideOnMobile: true },
    share<RepoRow>(),
  ];
  const orgCols: Col<OrgRow>[] = [
    { key: "org", label: "Organization" },
    { key: "repos", label: "Repositories", numeric: true, hideOnMobile: true },
    { key: "ai", label: "AI commits", numeric: true, hideOnMobile: true },
    { key: "total", label: "All commits", numeric: true, hideOnMobile: true },
    share<OrgRow>(),
  ];
  const langCols: Col<LanguageRow>[] = [
    { key: "language", label: "Language" },
    { key: "repos", label: "Repositories", numeric: true, hideOnMobile: true },
    { key: "ai", label: "AI commits", numeric: true, hideOnMobile: true },
    { key: "total", label: "All commits", numeric: true, hideOnMobile: true },
    share<LanguageRow>(),
  ];

  return (
    <>
      <div className="mt-6 max-w-sm">
        <label htmlFor="min-commits" className="block font-bold cond text-lg">Minimum commits in the window</label>
        <input
          id="min-commits"
          className="field"
          type="number"
          min={0}
          step={50}
          inputMode="numeric"
          value={Number.isNaN(min) ? "" : min}
          onChange={(e) => setMin(e.target.value === "" ? 0 : Math.max(0, Number(e.target.value)))}
        />
        <p className="text-sm text-muted mt-1">The scanner already drops rows under {defaultMin}; raise this to see only larger projects.</p>
      </div>

      <h2 id="repos" className="display cond text-[2rem] mt-12 border-t-2 border-ink pt-2">Repositories</h2>
      <SortableTable rows={repos} cols={repoCols} rowKey={(r) => r.repo} caption="Repositories by AI share" minCommits={min} noun="repositories" />

      <h2 id="orgs" className="display cond text-[2rem] mt-14 border-t-2 border-ink pt-2">Organizations</h2>
      <SortableTable rows={orgs} cols={orgCols} rowKey={(r) => r.org} caption="Organizations by AI share" minCommits={min} noun="organizations" />

      <h2 id="languages" className="display cond text-[2rem] mt-14 border-t-2 border-ink pt-2">Languages</h2>
      <SortableTable rows={languages} cols={langCols} rowKey={(r) => r.language} caption="Languages by AI share" minCommits={min} noun="languages" />
    </>
  );
}
