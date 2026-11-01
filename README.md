# ghostwritten

**How much of GitHub is ghostwritten by AI agents?** Exact, per-repository numbers.

Live: https://ghostwritten.vercel.app

A commit counts as AI-written only when it names its machine author: a `Co-authored-by: Claude <noreply@anthropic.com>` trailer, a `Generated with Claude Code` footer, a Copilot or Codex trailer, or an agent's own bot account (`copilot-swe-agent[bot]`, `devin-ai-integration[bot]`, ...). Dependabot-style automation and merge commits are removed from both sides of the fraction. Every number is therefore a floor: unsigned AI use is invisible.

## Your badge

```markdown
[![ghostwritten](https://ghostwritten.vercel.app/api/badge/OWNER/REPO.svg)](https://ghostwritten.vercel.app/r/OWNER/REPO)
```

Works for any public repository. It reads the last 500 commits on the default branch, applies the same rules as the scanner, and caches for a day. Looking a repository up also adds it to the nightly scan.

Your own number: `https://ghostwritten.vercel.app/u/YOUR_LOGIN`

## What is here

- `scanner/` — Python. Scans repositories through the GitHub REST API (no cloning), writes one JSON file per repository per month since January 2025. Runs nightly on GitHub Actions. Method, every rule and every limitation: [scanner/README.md](scanner/README.md).
- `web/` — Next.js. The site, the badge endpoint and the user card.
- `data/` — the dataset, committed and downloadable. `repos/*.json` per repository, `leaderboards.json`, `summary.json`, `universe.json`.
- `SCHEMA.md` — the data contract between the two.

Reproduce one repository's number:

```bash
cd scanner && GITHUB_TOKEN=$(gh auth token) python scan_repo.py pandas-dev/pandas
```

## Universe

The top repositories by stars (everything above ~11k stars, about 5,000 repositories) plus every repository or user anyone looks up on the site. The leaderboards rank repositories with at least 100 commits in the last three full months.

## Limitations

- Signed-only. Tools that leave no trailer (inline completions, most IDE agents) are not seen.
- Default branch only. Squash merges collapse many agent commits into one.
- Private repositories are invisible, and GitHub reports most activity is private.
- Bot accounts that are not on the explicit agent list count as automation, not AI. Example: `robobun` writes ~78% of bun's commits with no AI signature, so bun shows ~3%, while a study that counted that account reported 78%.

## Prior work

- [botcommits.dev](https://botcommits.dev/) — AI-attributed commits on all of public GitHub, monthly, by tool; the share is a range because GitHub publishes no commit denominator.
- [ai-agent-commits](https://github.com/delini2018-del/ai-agent-commits) — a 55-repository study, Jan 2025 to Oct 2026.
- [GitHub Octoverse 2026](https://github.blog/news-insights/octoverse/octoverse-commits-pushes-reach-new-highs-in-2026-as-developers-build-with-agents/) — 40%+ of pull requests started with an agent's first draft.

ghostwritten differs by measuring an exact denominator per repository, publishing the per-repository data, and giving every repository and user a number of their own.

## License

MIT.
