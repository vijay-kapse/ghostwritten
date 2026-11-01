import "server-only";
import { classify, fromApiCommit, toolForRule } from "./attribution";
import { gh, GithubError, hasToken, type ApiCommit, type ApiRepo } from "./github";
import type { MonthStats, RepoData } from "./types";

// The scanner buckets by committer date (UTC); the web does the same so the two agree.
const monthOf = (c: ApiCommit) => (c.commit.committer?.date ?? c.commit.author?.date ?? "").slice(0, 7);

/** Pages of 100 default-branch commits, newest first. Stops early on a short page. */
async function fetchCommits(path: string, maxCommits: number): Promise<ApiCommit[]> {
  const pages = Math.ceil(maxCommits / 100);
  const sep = path.includes("?") ? "&" : "?";
  const results = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      gh<ApiCommit[]>(`${path}${sep}per_page=100&page=${i + 1}`).catch((e) => {
        // First page errors are real; later pages on a short history are just empty.
        if (i > 0 && e instanceof GithubError && (e.status === 404 || e.status === 409)) return [] as ApiCommit[];
        throw e;
      }),
    ),
  );
  return results.flat().slice(0, maxCommits);
}

/** 500 commits with a token, 200 without (60 requests an hour is shared by every visitor). */
export const defaultRepoCommits = () => (hasToken() ? 500 : 200);

export async function computeRepo(
  owner: string,
  repo: string,
  opts: { maxCommits?: number; meta?: boolean } = {},
): Promise<RepoData> {
  const max = opts.maxCommits ?? defaultRepoCommits();
  const [meta, commits] = await Promise.all([
    opts.meta === false ? Promise.resolve(null) : gh<ApiRepo>(`/repos/${owner}/${repo}`),
    fetchCommits(`/repos/${owner}/${repo}/commits`, max).catch((e) => {
      if (e instanceof GithubError && e.status === 409) return [] as ApiCommit[];
      throw e;
    }),
  ]);

  const months: Record<string, MonthStats> = {};
  for (const c of commits) {
    const m = monthOf(c);
    if (!m) continue;
    const s = (months[m] ??= { total: 0, ai: 0, automation: 0, merges: 0, by_rule: {} });
    const { kind, rules } = classify(fromApiCommit(c));
    if (kind === "merge") s.merges++;
    else if (kind === "automation") s.automation++;
    else {
      s.total++;
      if (kind === "ai") {
        s.ai++;
        for (const r of rules) s.by_rule[r] = (s.by_rule[r] ?? 0) + 1;
      }
    }
  }
  const sorted = Object.fromEntries(Object.entries(months).sort(([a], [b]) => a.localeCompare(b)));
  const capped = commits.length >= max;
  const oldest = Object.keys(sorted)[0] ?? "";
  return {
    schema: 1,
    repo: meta?.full_name ?? `${owner}/${repo}`,
    org: meta?.owner.login ?? owner,
    language: meta?.language ?? null,
    stars: meta?.stargazers_count ?? null,
    default_branch: meta?.default_branch ?? "",
    scanned_at: new Date().toISOString(),
    window_start: oldest ? `${oldest}-01` : "",
    // Only the newest `max` commits were read, so older months can be partial.
    complete: !capped,
    months: sorted,
    live: { commits: commits.length, capped },
  };
}

export function pooled(data: RepoData): { ai: number; total: number; share: number; automation: number; merges: number } {
  let ai = 0, total = 0, automation = 0, merges = 0;
  for (const m of Object.values(data.months)) {
    ai += m.ai;
    total += m.total;
    automation += m.automation;
    merges += m.merges;
  }
  return { ai, total, share: total ? ai / total : 0, automation, merges };
}

export function ruleTotals(data: RepoData): { rule: string; ai: number }[] {
  const t: Record<string, number> = {};
  for (const m of Object.values(data.months)) for (const [k, v] of Object.entries(m.by_rule)) t[k] = (t[k] ?? 0) + v;
  return Object.entries(t).map(([rule, ai]) => ({ rule, ai })).sort((a, b) => b.ai - a.ai);
}

/** Tool-level counts from rule-level counts: the larger rule within a tool, so overlaps are not double counted. */
export function toolTotals(rules: { rule: string; ai: number }[]): { tool: string; ai: number }[] {
  const t: Record<string, number> = {};
  for (const { rule, ai } of rules) {
    const tool = toolForRule(rule);
    t[tool] = Math.max(t[tool] ?? 0, ai);
  }
  return Object.entries(t).map(([tool, ai]) => ({ tool, ai })).sort((a, b) => b.ai - a.ai);
}

// ---- users ----------------------------------------------------------------

export interface UserCard {
  login: string;
  name: string | null;
  avatar: string | null;
  commits: number;
  ai: number;
  share: number;
  topTool: string | null;
  tools: { tool: string; ai: number }[];
  repos: { repo: string; total: number; ai: number }[];
  reposSampled: number;
  generated_at: string;
}

interface ApiUser {
  login: string;
  name: string | null;
  avatar_url: string | null;
}

export async function computeUser(login: string): Promise<UserCard> {
  const [user, repoList] = await Promise.all([
    gh<ApiUser>(`/users/${login}`),
    gh<ApiRepo[]>(`/users/${login}/repos?sort=pushed&type=owner&per_page=40`),
  ]);
  // Forks hold upstream history the user did not write; skip them.
  const picked = repoList.filter((r) => !r.fork).slice(0, 10);

  const perRepo = await Promise.all(
    picked.map(async (r) => {
      try {
        const commits = await gh<ApiCommit[]>(
          `/repos/${r.full_name}/commits?author=${encodeURIComponent(login)}&per_page=100`,
        );
        return { repo: r.full_name, commits };
      } catch (e) {
        if (e instanceof GithubError && e.rateLimited) throw e;
        return { repo: r.full_name, commits: [] as ApiCommit[] };
      }
    }),
  );

  const all = perRepo
    .flatMap(({ repo, commits }) => commits.map((c) => ({ repo, c })))
    .sort((a, b) => (b.c.commit.committer?.date ?? "").localeCompare(a.c.commit.committer?.date ?? ""))
    .slice(0, 300);

  const repos = new Map<string, { repo: string; total: number; ai: number }>();
  const ruleCounts: Record<string, number> = {};
  let total = 0, ai = 0;
  for (const { repo, c } of all) {
    const { kind, rules } = classify(fromApiCommit(c));
    if (kind === "merge" || kind === "automation") continue;
    const row = repos.get(repo) ?? { repo, total: 0, ai: 0 };
    row.total++;
    total++;
    if (kind === "ai") {
      row.ai++;
      ai++;
      for (const r of rules) ruleCounts[r] = (ruleCounts[r] ?? 0) + 1;
    }
    repos.set(repo, row);
  }
  const tools = toolTotals(Object.entries(ruleCounts).map(([rule, n]) => ({ rule, ai: n })));
  return {
    login: user.login,
    name: user.name,
    avatar: user.avatar_url,
    commits: total,
    ai,
    share: total ? ai / total : 0,
    topTool: tools[0]?.tool ?? null,
    tools,
    repos: [...repos.values()].sort((a, b) => b.total - a.total),
    reposSampled: picked.length,
    generated_at: new Date().toISOString(),
  };
}
