import Link from "next/link";
import { BadgeBox } from "@/components/BadgeBox";
import { LookupBox } from "@/components/LookupBox";
import { MonthChart } from "@/components/MonthChart";
import { RankTable } from "@/components/RankTable";
import { Section } from "@/components/Section";
import { TickMeter } from "@/components/TickMeter";
import { toolForRule } from "@/lib/attribution";
import { loadLeaderboards, loadSummary } from "@/lib/data";
import { compact, num, pct, signedPoints, windowLabel } from "@/lib/format";

export default function Home() {
  const { data: lb } = loadLeaderboards();
  const { data: sum } = loadSummary();

  const topRepos = [...lb.repos].sort((a, b) => b.ai_share - a.ai_share).slice(0, 10);
  const topOrgs = [...lb.orgs].sort((a, b) => b.ai_share - a.ai_share).slice(0, 10);
  const toolMax = Math.max(1, ...lb.tools.map((t) => t.ai));

  const stats: { label: string; value: string }[] = [];
  if (sum) {
    if (sum.median_repo_ai_share !== null) stats.push({ label: "Median repository", value: pct(sum.median_repo_ai_share) });
    if (sum.repos_with_any_ai !== null) stats.push({ label: "Repositories with any AI commit", value: pct(sum.repos_with_any_ai, 0) });
    if (sum.mom_change !== null) stats.push({ label: "Change on the previous month", value: signedPoints(sum.mom_change) });
    if (sum.universe_repos) stats.push({ label: "Repositories scanned", value: num(sum.universe_repos) });
  }

  return (
    <>
      <section className="pt-8 sm:pt-12" aria-labelledby="headline">
        <h1 id="headline" className="display cond text-[1.5rem] sm:text-[2rem] max-w-[24ch]" style={{ lineHeight: 1.05 }}>
          How much of GitHub is ghostwritten by AI agents?
        </h1>

        {sum ? (
          <>
            <div className="mt-4 grid lg:grid-cols-[auto_1fr] gap-x-10 gap-y-3 items-end">
              <p
                className="display text-[clamp(7rem,30vw,17rem)] -ml-1 sm:-ml-2"
                aria-label={`${(sum.ai_share * 100).toFixed(1)} percent`}
              >
                {(sum.ai_share * 100).toFixed(1)}
                <span className="text-[0.42em] align-top ml-1 inline-block pt-[0.1em]">%</span>
              </p>
              <div className="pb-2 lg:pb-5">
                <p className="font-bold cond text-[1.35rem] sm:text-[1.6rem] leading-tight max-w-[30ch]">
                  of commits in the repositories we scanned carry an AI agent&rsquo;s signature
                  {sum.window ? `, ${windowLabel(sum.window)}` : ""}.
                </p>
                <p className="prose mt-3 text-[1.0625rem]">
                  A commit is counted only when it names its machine author: a Co-authored-by trailer, a
                  &ldquo;Generated with&rdquo; footer, or the agent&rsquo;s own bot account. Dependabot-style
                  automation and merge commits are dropped from both sides of the fraction.{" "}
                  <Link href="/methodology" className="link">Read the method</Link>.
                </p>
              </div>
            </div>
            <div className="mt-5">
              <TickMeter share={sum.ai_share} n={100} height={26} animate label={`${pct(sum.ai_share)} of commits`} />
              <div className="flex justify-between text-[12px] text-muted pt-1">
                <span>0%</span>
                <span>Each tick is one percentage point</span>
                <span>100%</span>
              </div>
            </div>
            {stats.length > 0 && (
              <dl className="mt-6 grid grid-cols-2 lg:grid-cols-4 border-t border-rule">
                {stats.map((s, i) => (
                  <div
                    key={s.label}
                    className={`py-3 pr-4 ${i % 2 === 1 ? "pl-4 border-l border-rule" : ""} ${i > 0 ? "lg:pl-4 lg:border-l lg:border-rule" : ""} ${i >= 2 ? "border-t border-rule lg:border-t-0" : ""}`}
                  >
                    <dt className="text-[13px] text-muted">{s.label}</dt>
                    <dd className="display cond text-[2rem]" style={{ lineHeight: 1.05 }}>{s.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        ) : (
          <div className="mt-8 border-l-[6px] border-accent pl-4 max-w-[60ch]">
            <p className="font-bold cond text-2xl">No scan results yet.</p>
            <p className="prose mt-2">
              The headline number appears after the first scan writes <code>data/summary.json</code>. In the meantime
              you can already{" "}
              <a className="link" href="#badge">make a badge</a> or <a className="link" href="#lookup">look up a username</a>,
              both of which read GitHub directly.
            </p>
          </div>
        )}
      </section>

      {lb.trend.length > 0 && (
        <Section
          id="trend"
          title="Month by month"
          note="Every scanned repository, pooled. Hover or touch a month to read it."
        >
          <MonthChart
            variant="trend"
            caption="Monthly commits, AI commits and AI share across all scanned repositories"
            points={lb.trend.map((t) => ({ month: t.month, total: t.total, ai: t.ai }))}
          />
        </Section>
      )}

      <div className="grid lg:grid-cols-2 gap-x-12">
        <Section
          id="top-repos"
          title="Top 10 repositories"
          note={lb.window ? `By AI share, ${windowLabel(lb.window)}, 100 commits minimum.` : undefined}
        >
          <RankTable
            noun="Repository"
            caption="Ten repositories with the highest AI share"
            rows={topRepos.map((r) => ({
              key: r.repo,
              label: r.repo,
              href: `/r/${r.repo}`,
              sub: [r.language, r.stars ? `${compact(r.stars)} stars` : null].filter(Boolean).join(", "),
              ai_share: r.ai_share,
              ai: r.ai,
              total: r.total,
            }))}
          />
          <p className="pt-3 text-sm"><Link href="/leaderboard" className="link">All repositories, organizations and languages</Link></p>
        </Section>
        <Section id="top-orgs" title="Top 10 organizations" note="Pooled across every scanned repository the owner has.">
          <RankTable
            noun="Organization"
            caption="Ten organizations with the highest AI share"
            rows={topOrgs.map((o) => ({
              key: o.org,
              label: o.org,
              sub: `${num(o.repos)} ${o.repos === 1 ? "repository" : "repositories"}`,
              ai_share: o.ai_share,
              ai: o.ai,
              total: o.total,
            }))}
          />
        </Section>
      </div>

      {lb.tools.length > 0 && (
        <Section
          id="tools"
          title="Which agents leave a signature"
          note="AI commits per detection rule. A commit that matches two rules is counted under both."
        >
          <table className="tbl">
            <caption className="sr-only">AI commits by detection rule</caption>
            <thead>
              <tr>
                <th scope="col">Rule</th>
                <th scope="col" className="hidden sm:table-cell">Tool</th>
                <th scope="col" className="w-[40%]"><span className="sr-only">Relative size</span></th>
                <th scope="col" className="r">AI commits</th>
              </tr>
            </thead>
            <tbody>
              {lb.tools.map((t) => (
                <tr key={t.rule}>
                  <td className="font-semibold">{t.rule}</td>
                  <td className="hidden sm:table-cell text-muted">{toolForRule(t.rule)}</td>
                  <td>
                    <div className="h-2.5 bg-accent" style={{ width: `${Math.max(1, (t.ai / toolMax) * 100)}%` }} />
                  </td>
                  <td className="r">{num(t.ai)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <div className="grid lg:grid-cols-2 gap-x-12">
        <Section id="badge" title="Get your badge" note="Works for any public repository.">
          <BadgeBox />
        </Section>
        <Section id="lookup" title="Look yourself up">
          <LookupBox />
        </Section>
      </div>
    </>
  );
}
