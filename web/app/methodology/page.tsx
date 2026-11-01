import type { Metadata } from "next";
import { Section } from "@/components/Section";
import { engine, SIGNATURES_SOURCE } from "@/lib/attribution";
import { loadLeaderboards } from "@/lib/data";
import { num } from "@/lib/format";
import { siteUrl } from "@/lib/slug";

export const metadata: Metadata = {
  title: "Methodology",
  description: "Exactly which commits count as ghostwritten, what is left out, and every known limitation.",
};

const KINDS: { key: "trailer" | "body" | "subject" | "names" | "logins"; label: string }[] = [
  { key: "trailer", label: "Co-authored-by trailer" },
  { key: "body", label: "Message body" },
  { key: "subject", label: "First line" },
  { key: "names", label: "Git author or committer name" },
  { key: "logins", label: "Exact login or name" },
];

const LIMITS: { title: string; body: string }[] = [
  {
    title: "Signed-only, so every number is a floor.",
    body: "A commit counts only if it carries a signature: a trailer, a footer or an agent's own account. An agent that commits under the developer's identity with no trailer, or a developer who deletes the trailer, is invisible and counted as human.",
  },
  {
    title: "A commit is not a line of code.",
    body: "One commit that an agent wrote counts the same as one it touched lightly. The share is of commits, not of code, effort or value.",
  },
  {
    title: "Squash-merges count as one commit.",
    body: "When a pull request is squashed, the many commits behind it become one on the default branch. Only that commit's message is read, and it keeps a trailer only if the squash message does.",
  },
  {
    title: "Merge commits are excluded.",
    body: "Any commit with two or more parents is dropped from both sides of the fraction.",
  },
  {
    title: "Automation is excluded from both sides.",
    body: "Dependabot, Renovate, release bots, CI bots and pre-commit-ci are not people and not agents. They are recorded as automation and appear in neither the numerator nor the denominator. Any other account ending in [bot] that is not a known AI agent is treated the same way.",
  },
  {
    title: "Only the default branch.",
    body: "Work on other branches counts when, and only when, it reaches the default branch.",
  },
  {
    title: "Prose mentions never count.",
    body: "A commit that merely says the word claude, cursor or codex in its message is human. Rules match structure (a trailer, a footer, an exact login), not words, which also means the rules are deliberately narrow.",
  },
  {
    title: "A commit can match several rules.",
    body: "The per-rule counts count each match, so they can add up to more than the AI total.",
  },
  {
    title: "Incomplete scans are flagged.",
    body: "When the scanner hits its request budget on a large repository, the repository is marked incomplete and only its newest months are trustworthy. Its page says so.",
  },
  {
    title: "The universe is chosen, not random.",
    body: "Leaderboards cover the repositories with the most stars plus every repository someone has looked up on this site. They describe popular public projects, not all of GitHub, and private code is invisible. Rankings require at least 100 commits in the window.",
  },
  {
    title: "Live lookups read a shorter history.",
    body: "A badge or repo page for a repository outside the scanned set reads its newest 500 default-branch commits (200 when the site has no GitHub token), over whatever period that covers. It is not the same window as the leaderboard.",
  },
  {
    title: "User cards are a small sample.",
    body: "A user card reads up to 300 of the user's newest commits across their 10 most recently pushed public repositories, skipping forks. Work in organizations' repositories, private repositories, and older history is not seen.",
  },
  {
    title: "Lookups are logged.",
    body: "Every repository or username looked up here is appended to data/requests.log in the project repository so the nightly scan can add it to the universe. Nothing else about the visitor is recorded.",
  },
];

export default function Methodology() {
  const { data: lb } = loadLeaderboards();
  const counts = new Map(lb.tools.map((t) => [t.rule, t.ai]));
  const sig = engine.signatures;
  const origin = siteUrl();
  const fromFixture = SIGNATURES_SOURCE === "fixture";

  return (
    <div className="pt-8 sm:pt-12 max-w-[1000px]">
      <h1 className="display cond text-[2.6rem] sm:text-[3.6rem]" style={{ lineHeight: 0.95 }}>Methodology</h1>
      <p className="prose mt-3">
        The question is narrow on purpose: for each commit on a repository&rsquo;s default branch, does the commit
        itself say an AI agent wrote it? Everything below is the whole definition. Nothing else is inferred.
      </p>

      <Section id="denominator" title="The fraction">
        <div className="prose">
          <p>
            <b>Numerator.</b> Commits on the default branch, in the window, that match at least one rule below.
          </p>
          <p>
            <b>Denominator.</b> All commits on the default branch in the window, minus automation commits, minus merge
            commits (two or more parents). Squash-merges count as one commit.
          </p>
          <p>
            Each commit is classified once, in this order: merge, then automation, then AI, then human. The first
            that applies wins, so a bot-authored commit that carries a Claude trailer is automation.
          </p>
        </div>
      </Section>

      <Section
        id="rules"
        title="The rules"
        note={
          fromFixture
            ? "Sample copy: scanner/signatures.json was not available in this build."
            : `From scanner/signatures.json, version ${sig.version}. The website runs these exact patterns.`
        }
      >
        {fromFixture && (
          <p role="note" className="mb-4 border-l-[6px] border-accent bg-paper2 px-3 py-2 text-[13.5px]">
            <b>Sample data.</b> This table is a fixture copy of the rules, not the live file.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="tbl">
            <caption className="sr-only">AI attribution rules</caption>
            <thead>
              <tr>
                <th scope="col">Rule id</th>
                <th scope="col">Tool</th>
                <th scope="col">What matches</th>
                {counts.size > 0 && <th scope="col" className="r">AI commits</th>}
              </tr>
            </thead>
            <tbody>
              {sig.rules.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="font-semibold whitespace-nowrap align-top">{r.id}</td>
                  <td className="align-top whitespace-nowrap">{r.tool}</td>
                  <td className="align-top">
                    <p>{r.description}</p>
                    <ul className="mt-1.5 text-[12.5px] text-muted space-y-0.5">
                      {KINDS.map(({ key, label }) => {
                        const pats = r[key];
                        if (!pats?.length) return null;
                        return (
                          <li key={key}>
                            {label}: {pats.map((p, i) => (
                              <span key={p}>
                                {i > 0 && " or "}
                                <code className="text-ink break-all">{p}</code>
                              </span>
                            ))}
                          </li>
                        );
                      })}
                    </ul>
                  </td>
                  {counts.size > 0 && <td className="r align-top">{num(counts.get(r.id) ?? 0)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-muted max-w-[75ch]">
          All patterns are case-insensitive and multiline. A trailer is any line that matches{" "}
          <code className="text-ink break-all">{sig.trailer_line}</code>. Logins are compared exactly, in lowercase.
        </p>
      </Section>

      <Section id="not-counted" title="Left out of both sides" note={`${sig.automation.length} listed automation accounts.`}>
        <p className="prose">
          Automation: <span className="text-[0.95em]">{sig.automation.join(", ")}</span>, and any other login ending in
          [bot] that is not on the agent list. Merge commits are left out as well.
        </p>
      </Section>

      <Section id="limitations" title="Limitations">
        <ol className="space-y-4 max-w-[75ch]">
          {LIMITS.map((l) => (
            <li key={l.title} className="border-t border-rule pt-2">
              <p className="font-bold cond text-lg leading-snug">{l.title}</p>
              <p className="prose text-[1.0625rem] mt-0.5">{l.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="reproduce" title="Reproduce it yourself" note="You need Python 3.11+ and a GitHub token with no special scopes.">
        <pre className="bg-paper2 p-4 text-[13px] leading-relaxed overflow-x-auto">{`git clone https://github.com/vijay-kapse/ghostwritten
cd ghostwritten/scanner
export GITHUB_TOKEN=ghp_yourtoken
python3 scan_repo.py owner/repo --fresh --months 2026-08..2026-10

# or the same rules over the last 500 commits, through this site's API
curl ${origin}/api/repo/owner/repo`}</pre>
        <p className="mt-3 text-sm text-muted max-w-[75ch]">
          The scan writes <code className="text-ink">data/repos/owner__repo.json</code> and prints the share for the
          months you ask for. The numbers on this site come from the same files; they are committed in the{" "}
          <a className="link text-ink" href="https://github.com/vijay-kapse/ghostwritten/tree/main/data">data folder</a>.
        </p>
      </Section>
    </div>
  );
}
