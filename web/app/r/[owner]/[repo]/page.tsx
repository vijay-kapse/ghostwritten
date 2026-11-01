import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { BadgeBox } from "@/components/BadgeBox";
import { MonthChart } from "@/components/MonthChart";
import { Section } from "@/components/Section";
import { TickMeter } from "@/components/TickMeter";
import { toolForRule } from "@/lib/attribution";
import { computeRepo, pooled, ruleTotals } from "@/lib/compute";
import { loadRepo, repoParams } from "@/lib/data";
import { dateLabel, monthLabel, num, pct } from "@/lib/format";
import { GithubError } from "@/lib/github";
import { logRequest } from "@/lib/requestlog";
import { isOwner, isRepoName } from "@/lib/slug";
import type { RepoData } from "@/lib/types";

export const revalidate = 86400;

type Params = { owner: string; repo: string };

export function generateStaticParams() {
  return repoParams(300);
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { owner, repo } = await params;
  return {
    title: `${owner}/${repo}`,
    description: `How much of ${owner}/${repo} was ghostwritten by AI agents, month by month.`,
  };
}

async function resolve(owner: string, repo: string): Promise<{ data: RepoData; sample: boolean; live: boolean }> {
  const stored = loadRepo(owner, repo);
  if (stored) return { data: stored.data, sample: stored.provenance === "sample", live: false };
  try {
    const data = await computeRepo(owner, repo);
    after(() => logRequest(`${owner}/${repo}`));
    return { data, sample: false, live: true };
  } catch (e) {
    if (e instanceof GithubError && e.status === 404) notFound();
    throw e;
  }
}

export default async function RepoPage({ params }: { params: Promise<Params> }) {
  const { owner, repo } = await params;
  if (!isOwner(owner) || !isRepoName(repo)) notFound();
  const { data, live, sample } = await resolve(owner, repo);

  const p = pooled(data);
  const months = Object.entries(data.months).sort(([a], [b]) => a.localeCompare(b));
  const first = months[0]?.[0];
  const last = months[months.length - 1]?.[0];
  const rules = ruleTotals(data);
  const ruleMax = Math.max(1, ...rules.map((r) => r.ai));
  const [name, rname] = data.repo.split("/");
  const ghUrl = `https://github.com/${data.repo}`;

  return (
    <div className="pt-8 sm:pt-12">
      <p className="text-muted text-[15px]">{name} /</p>
      <h1 className="display cond text-[clamp(2.6rem,9vw,5.2rem)] break-words" style={{ lineHeight: 0.92 }}>{rname}</h1>
      <p className="mt-2 text-[14px] text-muted">
        {[data.language, data.stars !== null ? `${num(data.stars)} stars` : null, data.default_branch ? `branch ${data.default_branch}` : null]
          .filter(Boolean)
          .join(", ")}
        {" "}
        <a href={ghUrl} className="link text-ink">View on GitHub</a>
      </p>

      {sample && (
        <p className="mt-4 border-l-[6px] border-accent bg-paper2 pl-3 py-1 max-w-[70ch]" role="note">
          <b>Sample data.</b> This repository is invented to show the layout.
        </p>
      )}
      {live && (
        <p className="mt-4 border-l-[6px] border-accent pl-3 py-1 max-w-[70ch]" role="note">
          <b>Computed live.</b> This repository is not in the scanned set yet, so these numbers come from its latest{" "}
          {num(data.live?.commits ?? 0)} commits on GitHub, cached for 24 hours. It has been queued for the next scan.
        </p>
      )}
      {!data.complete && !live && (
        <p className="mt-4 border-l-[6px] border-accent pl-3 py-1 max-w-[70ch]" role="note">
          <b>Incomplete scan.</b> The scan hit a limit on this repository, so only the newest months are trustworthy.
          Older months, if shown, may be missing commits.
        </p>
      )}
      {live && data.live?.capped && (
        <p className="mt-3 text-sm text-muted max-w-[70ch]">
          History beyond the latest {num(data.live.commits)} commits is not read, so the oldest month below may be partial.
        </p>
      )}

      {p.total === 0 ? (
        <p className="prose mt-10">No countable commits yet: every commit here is a merge or automation, which are left out.</p>
      ) : (
        <>
          <div className="mt-6 grid lg:grid-cols-[auto_1fr] gap-x-12 gap-y-4 items-end">
            <p className="display text-[clamp(6rem,24vw,13rem)] -ml-1" aria-label={`${(p.share * 100).toFixed(1)} percent`}>
              {(p.share * 100).toFixed(1)}
              <span className="text-[0.42em] align-top ml-1 inline-block pt-[0.1em]">%</span>
            </p>
            <div className="pb-3">
              <p className="font-bold cond text-[1.3rem] max-w-[34ch] leading-tight">
                of {num(p.total)} commits carry an AI agent&rsquo;s signature
                {first && last ? `, ${monthLabel(first)}${first !== last ? ` to ${monthLabel(last)}` : ""}` : ""}.
              </p>
              <p className="text-sm text-muted mt-2">
                Left out: {num(p.automation)} automation commits and {num(p.merges)} merge commits.
                {!live && data.scanned_at ? ` Scanned ${dateLabel(data.scanned_at)}.` : ""}
              </p>
            </div>
          </div>
          <div className="mt-4"><TickMeter share={p.share} n={100} height={20} label={`${pct(p.share)} of commits`} /></div>
        </>
      )}

      <Section id="months" title="Month by month" note="Human commits below, AI commits above.">
        <MonthChart
          variant="stack"
          caption={`Monthly human and AI commits in ${data.repo}`}
          points={months.map(([month, s]) => ({ month, total: s.total, ai: s.ai }))}
        />
      </Section>

      <Section id="rules" title="Which signatures matched" note="A commit that matches two rules is counted under both, so rows can add up to more than the AI total.">
        {rules.length === 0 ? (
          <p className="text-muted">No commit in this repository matched an AI rule.</p>
        ) : (
          <table className="tbl">
            <caption className="sr-only">AI commits by detection rule</caption>
            <thead>
              <tr>
                <th scope="col">Rule</th>
                <th scope="col" className="hidden sm:table-cell">Tool</th>
                <th scope="col" className="w-[35%]"><span className="sr-only">Relative size</span></th>
                <th scope="col" className="r">Commits</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.rule}>
                  <td className="font-semibold">{r.rule}</td>
                  <td className="hidden sm:table-cell text-muted">{toolForRule(r.rule)}</td>
                  <td><div className="h-2.5 bg-accent" style={{ width: `${Math.max(2, (r.ai / ruleMax) * 100)}%` }} /></td>
                  <td className="r">{num(r.ai)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section id="badge" title="Badge for this README" note="Updates itself; GitHub caches it for a day.">
        <div className="max-w-[640px]"><BadgeBox initial={data.repo} compact /></div>
        <p className="mt-4 text-sm text-muted">
          The same numbers as JSON: <a className="link text-ink" href={`/api/repo/${data.repo}`}>/api/repo/{data.repo}</a>
        </p>
      </Section>
    </div>
  );
}
