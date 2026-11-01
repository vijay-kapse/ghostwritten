# ghostwritten: data contract

Two components share this contract. `scanner/` (Python) produces the files; `web/` (Next.js) reads them.
Change this file first, then both sides.

## What is counted

A commit is **AI-attributed** when any of these hold (case-insensitive). Every rule has an id, and the id is
stored with the commit so the methodology page can show counts per rule.

| id | rule |
|---|---|
| claude_trailer | `Co-authored-by:` line whose name or email mentions `claude` or `noreply@anthropic.com` |
| claude_generated | body contains `Generated with [Claude Code]` or `Generated with Claude Code` |
| copilot_trailer | `Co-authored-by:` line mentioning `copilot` (incl. `Copilot <...@users.noreply.github.com>`) |
| copilot_author | author or committer login is `copilot-swe-agent[bot]`, `Copilot`, `github-copilot[bot]`, `copilot-pull-request-reviewer[bot]` |
| codex_trailer | `Co-authored-by:` mentioning `codex` or `openai` |
| cursor | trailer or body mentioning `cursor` as an agent (e.g. `Co-authored-by: Cursor Agent`, `cursoragent`) |
| devin | author/committer login `devin-ai-integration[bot]` or trailer mentioning `devin` |
| gemini | trailer/author mentioning `gemini-code-assist`, `google-labs-jules[bot]`, `jules` |
| aider | body contains `aider:` or trailer mentions `aider` |
| openhands | trailer/author mentions `openhands` or `all-hands` |
| amp_factory | trailer mentions `amp-ai`, `sourcegraph amp`, `factory-droid` |
| other_bot_agent | author login ends with `[bot]` AND the bot is in `scanner/signatures.py` ALLOWLIST (explicit, no wildcard) |

Not counted: dependabot, renovate, release bots, CI bots, pre-commit-ci. They are **excluded from both numerator and denominator** and recorded separately as `automation`.

Denominator: all commits on the default branch in the window, minus `automation`, minus merge commits
(commits with 2+ parents). Squash-merges count as one commit (stated as a limitation).

## Files (committed to the repo under `data/`)

### `data/repos/{owner}__{repo}.json`
```json
{
  "schema": 1,
  "repo": "owner/repo",
  "org": "owner",
  "language": "Python",
  "stars": 12345,
  "default_branch": "main",
  "scanned_at": "2026-11-01T00:00:00Z",
  "window_start": "2025-01-01",
  "complete": true,
  "months": {
    "2026-10": {"total": 812, "ai": 203, "automation": 40, "merges": 12,
                 "by_rule": {"claude_trailer": 150, "copilot_author": 53}}
  }
}
```
`complete=false` means the scan hit a limit and only the newest months are trustworthy; the web must label it.

### `data/leaderboards.json`
```json
{
  "schema": 1, "generated_at": "...", "universe": {"repos": 5000, "selection": "top by stars, plus on-demand lookups"},
  "window": "2026-08..2026-10",
  "repos":     [{"repo": "oven-sh/bun", "ai_share": 0.78, "ai": 1500, "total": 1923, "stars": 80000, "language": "Zig"}],
  "orgs":      [{"org": "microsoft", "ai_share": 0.31, "ai": 9000, "total": 29000, "repos": 120}],
  "languages": [{"language": "TypeScript", "ai_share": 0.22, "ai": 50000, "total": 230000, "repos": 900}],
  "tools":     [{"rule": "claude_trailer", "ai": 40000}],
  "trend":     [{"month": "2025-01", "ai": 100, "total": 90000, "ai_share": 0.001}]
}
```
Ranking rule for repos/orgs: minimum 100 commits in the window, sorted by `ai_share`.

### `data/summary.json`
Headline numbers the home page shows: universe size, window, pooled `ai_share`, median repo `ai_share`,
share of repos with any AI commit, month-over-month change, `generated_at`.

## On-demand (web, not scanner)

`/api/badge/{owner}/{repo}.svg`: last 500 default-branch commits via the GitHub REST API using the same
rules (the web imports `scanner/signatures.json`, a machine-readable export of the rules). Cache 24 h.
Badge text: `ghostwritten | 23% AI`. Color scale: grey <5%, blue <25%, orange <50%, red >=50%.

`/u/{login}`: the user's last 300 commits authored by them across their 10 most recently pushed public
repos; same rules; produces a shareable card (OG image) with the share and the top tool.

Every looked-up repo/user is appended to `data/requests.log` by the web (via a GitHub issue comment or a
lightweight API that the scanner reads), so the nightly scan picks it up and it joins the universe.
