# ghostwritten web

The public site: headline number, trend, leaderboards, per-repo pages, README badges and a shareable card for any
GitHub user. Next.js (App Router, TypeScript), Tailwind, no component library, no database. The data contract is
[`../SCHEMA.md`](../SCHEMA.md).

## How it works

- Pages are static. They read `../data/*.json` (written by `scanner/`) with `fs` at build time. When
  `../data/leaderboards.json` is missing, `fixtures/` (invented repos, labelled "sample data") is used instead.
- `/r/{owner}/{repo}` is prebuilt for the 300 most-starred scanned repos. Any other repo is rendered on first visit
  from the GitHub API, cached for 24 h, and queued for the scanner.
- `/u/{login}` and its OG image are rendered on demand and cached for 24 h.
- `lib/attribution.ts` is the TypeScript port of `scanner/signatures.py`. It does not re-type the regexes: it runs
  `scanner/signatures.json` (copied to `lib/signatures.generated.json` by `npm run sync`, which falls back to
  `fixtures/signatures.json` when `scanner/` is absent).

## Routes

| Route | What |
|---|---|
| `/` | headline, trend chart, top 10 repos and orgs, badge box, user lookup |
| `/leaderboard` | sortable repo, org and language tables with a minimum-commit filter |
| `/r/[owner]/[repo]` | monthly stacked bars, by-rule table, badge snippet |
| `/u/[login]` (+ `opengraph-image`) | user card, 24 h cache |
| `/methodology` | rules table from `signatures.json`, denominator, limitations, reproduce command |
| `/api/badge/[owner]/[repo]` | SVG badge; `.svg` suffix optional |
| `/api/repo/[owner]/[repo]` | JSON for the same computation |
| `POST /api/request` | `{"repo":"owner/name"}` or `{"user":"login"}`; appends to `data/requests.log` |

## Deploy on Vercel (Hobby)

Do not add a `vercel.json`. Project settings:

| Setting | Value |
|---|---|
| Framework preset | Next.js |
| Root Directory | `web` |
| Include source files outside of the Root Directory | **enabled** (default). Needed so `../data` and `../scanner` are readable at build time |
| Build / install commands | defaults (`npm run build`, `npm install`) |

Environment variables:

| Name | Required | Notes |
|---|---|---|
| `GITHUB_TOKEN` | yes, in production | Fine-grained token: read access to public repos, plus **Contents: read and write on this repo** (for `data/requests.log`). Without it the badge and user card read 200 commits per repo and run on GitHub's 60 requests an hour, and request logging is skipped. |
| `NEXT_PUBLIC_SITE_URL` | recommended | e.g. `https://ghostwritten.dev`. Used in badge markdown and OG tags. Defaults to that value. |
| `GHOSTWRITTEN_REPO` | no | `owner/name` that receives `data/requests.log`. Default `vijay-kapse/ghostwritten` |

Data commits (nightly scan, request log) trigger redeploys. The request log commit message is `[skip ci] request`.

## Develop

```
npm install
npm run dev        # http://localhost:3000
npm test           # vitest: attribution, parity with the Python scanner, badge, request log
npm run lint
npm run build
```

Useful switches: `GHOSTWRITTEN_DATA_DIR=/nonexistent npm run build` proves the sample fallback;
`npm run fixtures` regenerates `fixtures/`; `npm run parity` (needs `scanner/`) regenerates
`fixtures/parity.json` from the Python implementation.
