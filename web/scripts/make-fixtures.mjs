// Regenerates web/fixtures/{summary,leaderboards}.json and fixtures/repos/*.json.
// All repo and org names are fictional; the numbers are invented. They exist so the site
// renders before the scanner has produced data/. Deterministic (seeded).
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
rmSync(path.join(root, "repos"), { recursive: true, force: true });
mkdirSync(path.join(root, "repos"), { recursive: true });

let seed = 20261101;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

const months = [];
for (let y = 2025, m = 1; y < 2026 || m <= 10; ) {
  months.push(`${y}-${String(m).padStart(2, "0")}`);
  if (++m > 12) { m = 1; y++; }
}
const WINDOW = months.slice(-3);

const TOOLMIX = {
  claude: { claude_trailer: 0.62, claude_generated: 0.38 },
  copilot: { copilot_author: 0.7, copilot_trailer: 0.3 },
  codex: { codex_trailer: 1 },
  cursor: { cursor: 1 },
  mixed: { claude_trailer: 0.4, copilot_author: 0.2, cursor: 0.2, codex_trailer: 0.1, aider: 0.1 },
  devin: { devin: 0.8, other_bot_agent: 0.2 },
};

// [repo, language, stars, monthly commits, ai start month index, ai ceiling, mix, complete]
const SPEC = [
  ["lantern-labs/lantern", "TypeScript", 84210, 900, 3, 0.71, "claude"],
  ["northwind/orbit", "Rust", 61230, 520, 8, 0.44, "mixed"],
  ["tinyfoundry/kiln", "Zig", 39870, 330, 2, 0.78, "claude"],
  ["quarry-io/quarry", "Go", 52140, 740, 6, 0.29, "copilot"],
  ["quarry-io/quarry-docs", "TypeScript", 7410, 210, 5, 0.55, "claude"],
  ["halyard/halyard", "Python", 47320, 610, 9, 0.18, "mixed"],
  ["halyard/halyard-ui", "TypeScript", 12050, 280, 4, 0.52, "cursor"],
  ["brightwater/stream", "Java", 33910, 450, 10, 0.12, "copilot"],
  ["brightwater/stream-sdk", "Python", 8120, 190, 6, 0.36, "codex"],
  ["cobalt-systems/cobalt", "C++", 71500, 1100, 12, 0.07, "mixed"],
  ["cobalt-systems/cobalt-cli", "Go", 9340, 240, 7, 0.33, "claude"],
  ["fernwood/fern", "Ruby", 26610, 170, 14, 0.04, "copilot"],
  ["mosaic-dev/mosaic", "TypeScript", 58760, 980, 5, 0.47, "cursor"],
  ["mosaic-dev/mosaic-cloud", "Go", 6230, 360, 3, 0.64, "claude"],
  ["paperplane/paperplane", "Swift", 21800, 260, 11, 0.15, "mixed"],
  ["sable-ai/sable-agents", "Python", 15780, 410, 1, 0.82, "devin"],
  ["sable-ai/sable-evals", "Python", 5290, 150, 2, 0.74, "claude"],
  ["ironbark/ironbark", "Kotlin", 18420, 300, 9, 0.21, "copilot"],
  ["ironbark/ironbark-android", "Kotlin", 4410, 120, 10, 0.26, "copilot"],
  ["openmeadow/meadow", "PHP", 29980, 350, 16, 0.03, "mixed"],
  ["vellum-works/vellum", "TypeScript", 36200, 540, 4, 0.58, "claude"],
  ["vellum-works/vellum-docs", "TypeScript", 3320, 95, 3, 0.69, "claude"],
  ["deepcurrent/current", "Rust", 44650, 470, 7, 0.38, "mixed"],
  ["kestrel-lang/kestrel", "Rust", 27300, 380, 13, 0.09, "mixed"],
  ["pinecone-farm/pine", "C", 15200, 140, 20, 0.01, "mixed"],
  ["alder-co/alder", "Python", 22140, 310, 8, 0.31, "codex"],
  ["alder-co/alder-web", "JavaScript", 11430, 205, 6, 0.42, "cursor"],
  ["thistle/thistle", "Dart", 13380, 230, 12, 0.17, "mixed"],
  ["umbra-sec/umbra", "Go", 9950, 160, 15, 0.06, "mixed"],
  ["driftwood/driftwood", "Python", 31050, 270, 18, 0.02, "mixed"],
];

const repos = [];
for (const [repo, language, stars, base, start, ceil, mix, ] of SPEC) {
  const [org] = repo.split("/");
  const complete = !["pinecone-farm/pine", "cobalt-systems/cobalt"].includes(repo);
  const out = {};
  months.forEach((mo, i) => {
    const season = 1 + 0.15 * Math.sin(i / 2) + (rnd() - 0.5) * 0.3;
    const total = Math.max(8, Math.round(base * season * (0.8 + i / 60)));
    const ramp = i < start ? 0 : 1 / (1 + Math.exp(-(i - start - 4) / 2.2));
    const share = Math.max(0, Math.min(0.97, ceil * ramp * (0.92 + rnd() * 0.16)));
    const ai = Math.min(total, Math.round(total * share));
    const by_rule = {};
    let left = ai;
    const entries = Object.entries(TOOLMIX[mix]);
    entries.forEach(([rule, w], j) => {
      const n = j === entries.length - 1 ? left : Math.min(left, Math.round(ai * w));
      if (n > 0) by_rule[rule] = n;
      left -= n;
    });
    out[mo] = {
      total, ai,
      automation: Math.round(total * (0.02 + rnd() * 0.08)),
      merges: Math.round(total * (0.03 + rnd() * 0.07)),
      by_rule,
    };
  });
  const keep = complete ? months : months.slice(-9);
  const data = {
    schema: 1, repo, org, language, stars, default_branch: "main",
    scanned_at: "2026-11-01T03:12:44Z", window_start: "2025-01-01", complete,
    months: Object.fromEntries(keep.map((m) => [m, out[m]])),
  };
  writeFileSync(path.join(root, "repos", `${org}__${repo.split("/")[1]}.json`), JSON.stringify(data, null, 2) + "\n");
  repos.push(data);
}

const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const winStats = (r) => {
  let ai = 0, total = 0;
  for (const m of WINDOW) if (r.months[m]) { ai += r.months[m].ai; total += r.months[m].total; }
  return { ai, total };
};
const r4 = (x) => Math.round(x * 10000) / 10000;

const repoRows = repos.map((r) => ({ r, ...winStats(r) })).filter((x) => x.total >= 100)
  .map(({ r, ai, total }) => ({ repo: r.repo, ai_share: r4(ai / total), ai, total, stars: r.stars, language: r.language }))
  .sort((a, b) => b.ai_share - a.ai_share);

const group = (keyf, extra) => {
  const map = new Map();
  for (const r of repos) {
    const k = keyf(r); const s = winStats(r);
    const g = map.get(k) ?? { ai: 0, total: 0, repos: 0 };
    g.ai += s.ai; g.total += s.total; g.repos += 1; map.set(k, g);
  }
  return [...map].map(([k, g]) => ({ ...extra(k), ai_share: r4(g.ai / g.total), ai: g.ai, total: g.total, repos: g.repos }))
    .filter((x) => x.total >= 100).sort((a, b) => b.ai_share - a.ai_share);
};
const orgs = group((r) => r.org, (org) => ({ org }));
const languages = group((r) => r.language, (language) => ({ language }));

const toolMap = {};
for (const r of repos) for (const m of WINDOW) for (const [k, v] of Object.entries(r.months[m]?.by_rule ?? {})) toolMap[k] = (toolMap[k] ?? 0) + v;
const tools = Object.entries(toolMap).map(([rule, ai]) => ({ rule, ai })).sort((a, b) => b.ai - a.ai);

const trend = months.map((month) => {
  let ai = 0, total = 0;
  for (const r of repos) if (r.months[month]) { ai += r.months[month].ai; total += r.months[month].total; }
  return { month, ai, total, ai_share: r4(ai / total) };
});

const wAi = sum(repos, (r) => winStats(r).ai), wTotal = sum(repos, (r) => winStats(r).total);
const leaderboards = {
  schema: 1, generated_at: "2026-11-01T03:40:00Z",
  universe: { repos: repos.length, selection: "sample data: invented repositories" },
  window: `${WINDOW[0]}..${WINDOW[2]}`,
  repos: repoRows, orgs, languages, tools, trend,
};
const shares = repos.map((r) => { const s = winStats(r); return s.ai / s.total; }).sort((a, b) => a - b);
const prev = months.slice(-4, -1);
let pAi = 0, pTotal = 0;
for (const r of repos) for (const m of prev) if (r.months[m]) { pAi += r.months[m].ai; pTotal += r.months[m].total; }
const summary = {
  schema: 1, generated_at: leaderboards.generated_at, window: leaderboards.window,
  universe_repos: repos.length, ai: wAi, total: wTotal, ai_share: r4(wAi / wTotal),
  median_repo_ai_share: r4(shares[Math.floor(shares.length / 2)]),
  repos_with_any_ai_share: r4(repos.filter((r) => winStats(r).ai > 0).length / repos.length),
  mom_change: r4(wAi / wTotal - pAi / pTotal),
};
writeFileSync(path.join(root, "leaderboards.json"), JSON.stringify(leaderboards, null, 2) + "\n");
writeFileSync(path.join(root, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(`fixtures: ${repos.length} repos, window ${leaderboards.window}, pooled share ${summary.ai_share}`);
