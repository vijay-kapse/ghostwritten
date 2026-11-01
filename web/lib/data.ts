import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Leaderboards, Provenance, RepoData, Summary } from "./types";

// Next runs with cwd = web/ (both `next build` and, on Vercel, the function runtime).
const WEB = process.cwd();
const DATA_DIR = path.resolve(WEB, "..", "data");
const FIXTURES = path.join(WEB, "fixtures");

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function hasRealData(): boolean {
  return fs.existsSync(path.join(DATA_DIR, "leaderboards.json"));
}

export function provenance(): Provenance {
  return hasRealData() ? "data" : "sample";
}

export interface Loaded<T> {
  data: T;
  provenance: Provenance;
}

const EMPTY_LEADERBOARDS: Leaderboards = {
  schema: 1,
  generated_at: "",
  universe: { repos: 0, selection: "" },
  window: "",
  repos: [],
  orgs: [],
  languages: [],
  tools: [],
  trend: [],
};

export function loadLeaderboards(): Loaded<Leaderboards> {
  const real = readJson<Leaderboards>(path.join(DATA_DIR, "leaderboards.json"));
  if (real) return { data: { ...EMPTY_LEADERBOARDS, ...real }, provenance: "data" };
  const sample = readJson<Leaderboards>(path.join(FIXTURES, "leaderboards.json"));
  return { data: sample ?? EMPTY_LEADERBOARDS, provenance: "sample" };
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pick = (o: Record<string, unknown>, ...keys: string[]): number | null => {
  for (const k of keys) {
    const v = num(o[k]);
    if (v !== null) return v;
  }
  return null;
};

/** SCHEMA.md does not fix summary.json's key names, so aliases are accepted and gaps are derived. */
export function loadSummary(): Loaded<Summary | null> {
  const lb = loadLeaderboards();
  const dir = lb.provenance === "data" ? DATA_DIR : FIXTURES;
  const raw = readJson<Record<string, unknown>>(path.join(dir, "summary.json")) ?? {};
  const universe = (raw.universe ?? {}) as Record<string, unknown>;

  const trend = lb.data.trend;
  const last = trend[trend.length - 1];
  const prev = trend[trend.length - 2];

  let ai = pick(raw, "ai", "ai_commits");
  let total = pick(raw, "total", "total_commits");
  if (ai === null && total === null && lb.data.repos.length) {
    ai = lb.data.repos.reduce((s, r) => s + r.ai, 0);
    total = lb.data.repos.reduce((s, r) => s + r.total, 0);
  }
  let share = pick(raw, "ai_share", "pooled_ai_share", "share");
  if (share === null && ai !== null && total) share = ai / total;
  if (share === null && last) share = last.ai_share;
  if (share === null) return { data: null, provenance: lb.provenance };

  const data: Summary = {
    generated_at: String(raw.generated_at ?? lb.data.generated_at ?? ""),
    window: String(raw.window ?? lb.data.window ?? ""),
    universe_repos:
      pick(raw, "universe_repos", "repos", "universe_size") ?? pick(universe, "repos") ?? (lb.data.universe.repos || null),
    ai,
    total,
    ai_share: share,
    median_repo_ai_share: pick(raw, "median_repo_ai_share", "median_ai_share", "median_repo_share"),
    repos_with_any_ai: pick(raw, "repos_with_any_ai_share", "share_repos_with_ai", "repos_with_any_ai", "share_repos_any_ai"),
    mom_change: pick(raw, "mom_change", "month_over_month", "mom_delta") ?? (last && prev ? last.ai_share - prev.ai_share : null),
  };
  return { data, provenance: lb.provenance };
}

// ---- per-repo files -------------------------------------------------------

function repoDirs(): { dir: string; provenance: Provenance }[] {
  const dirs: { dir: string; provenance: Provenance }[] = [];
  const real = path.join(DATA_DIR, "repos");
  if (fs.existsSync(real)) dirs.push({ dir: real, provenance: "data" });
  if (!hasRealData()) dirs.push({ dir: path.join(FIXTURES, "repos"), provenance: "sample" });
  return dirs;
}

let fileIndex: Map<string, { file: string; provenance: Provenance }> | null = null;
function index() {
  if (fileIndex) return fileIndex;
  const m = new Map<string, { file: string; provenance: Provenance }>();
  for (const { dir, provenance } of repoDirs()) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      const key = f.slice(0, -5).toLowerCase();
      if (!m.has(key)) m.set(key, { file: path.join(dir, f), provenance });
    }
  }
  fileIndex = m;
  return m;
}

export function loadRepo(owner: string, repo: string): Loaded<RepoData> | null {
  const hit = index().get(`${owner}__${repo}`.toLowerCase());
  if (!hit) return null;
  const data = readJson<RepoData>(hit.file);
  if (!data || !data.months) return null;
  return { data, provenance: hit.provenance };
}

/** Repos that get a prebuilt page: those with the most stars, capped to keep builds fast. */
export function repoParams(limit = 300): { owner: string; repo: string }[] {
  const out: { repo: string; owner: string; stars: number }[] = [];
  for (const { file } of index().values()) {
    const d = readJson<RepoData>(file);
    if (!d?.repo?.includes("/")) continue;
    const [owner, repo] = d.repo.split("/");
    out.push({ owner, repo, stars: d.stars ?? 0 });
  }
  return out.sort((a, b) => b.stars - a.stars).slice(0, limit).map(({ owner, repo }) => ({ owner, repo }));
}
