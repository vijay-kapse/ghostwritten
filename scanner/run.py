"""One nightly run: refresh the universe, scan as many repos as the budgets allow, aggregate.

Budgets: wall clock (default 50 minutes) and requests (core `remaining` from GET /rate_limit, minus a reserve).
Order: (a) repos from data/requests.log never scanned, (b) top-star repos never scanned (most stars first),
(c) everything else by oldest `scanned_at`. A repo is only started if the remaining request budget can
cover a full repo (max pages + overhead), so no repo is left half-written.
"""

from __future__ import annotations

import argparse
import sys
import time
import traceback

import aggregate
import universe
from github import BudgetExhausted, GitHub, GitHubError
from scan_repo import DATA, MAX_PAGES, load_json, repo_path, scan_repo

OVERHEAD = 3  # repo metadata + head lookup + compare page that may precede the commit pages
RESERVE = 25  # left untouched for the aggregate step and safety


def plan(univ: dict, data_dir=DATA) -> list[tuple[str, dict, str]]:
    """Return [(repo, universe entry, bucket)] in priority order."""
    a, b, c = [], [], []
    for e in univ.get("repos", []):
        if e.get("fork"):
            continue
        doc = load_json(repo_path(e["repo"], data_dir))
        if doc is None:
            (a if e.get("source") == "request" else b).append(e)
        else:
            c.append((doc.get("scanned_at", ""), e))
    b.sort(key=lambda e: -e.get("stars", 0))
    c.sort(key=lambda t: t[0])
    return (
        [(e["repo"], e, "request") for e in a]
        + [(e["repo"], e, "new") for e in b]
        + [(e["repo"], e, "refresh") for _, e in c]
    )


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Nightly ghostwritten scan")
    ap.add_argument("--minutes", type=float, default=50)
    ap.add_argument("--max-pages", type=int, default=MAX_PAGES)
    ap.add_argument("--max-repos", type=int, default=None)
    ap.add_argument("--top", type=int, default=universe.TOP_N)
    ap.add_argument("--skip-universe", action="store_true")
    a = ap.parse_args(argv)

    t0 = time.time()
    deadline = t0 + a.minutes * 60
    gh = GitHub()
    rl = gh.rate_limit()["core"]
    gh.request_budget = max(rl["remaining"] - RESERVE, 0)
    gh.deadline = deadline
    print(f"rate limit: {rl['remaining']}/{rl['limit']} core remaining; request budget {gh.request_budget}")

    if not a.skip_universe:
        try:
            univ = universe.build(gh, top=a.top)
        except (BudgetExhausted, GitHubError) as e:
            print(f"universe refresh failed: {e}; using the existing file")
            univ = load_json(universe.UNIVERSE) or {"repos": []}
    else:
        univ = load_json(universe.UNIVERSE) or {"repos": []}

    queue = plan(univ)
    counts = {"request": 0, "new": 0, "refresh": 0}
    modes: dict[str, int] = {}
    errors, scanned, commits = [], 0, 0
    secs_per_repo = []
    stop_reason = "queue empty"
    for name, entry, bucket in queue:
        if a.max_repos is not None and scanned >= a.max_repos:
            stop_reason = "max repos"
            break
        left = gh.budget_left()
        if left is not None and left < a.max_pages + OVERHEAD:
            stop_reason = "request budget"
            break
        # Do not start a repo we probably cannot finish before the deadline.
        est = max(secs_per_repo[-20:], default=30)
        if time.time() + min(est, 120) > deadline:
            stop_reason = "time budget"
            break
        meta = None
        if entry.get("default_branch"):
            meta = {
                "full_name": entry["repo"],
                "default_branch": entry["default_branch"],
                "stargazers_count": entry.get("stars", 0),
                "language": entry.get("language"),
            }
        ts = time.time()
        try:
            res = scan_repo(gh, name, meta=meta, max_pages=a.max_pages)
        except BudgetExhausted as e:
            stop_reason = str(e)
            break
        except Exception as e:  # one broken repo must not end the night
            errors.append(f"{name}: {e}")
            traceback.print_exc(limit=2)
            continue
        secs_per_repo.append(time.time() - ts)
        if "error" in res:
            errors.append(f"{name}: {res['error']}")
            continue
        scanned += 1
        commits += res["commits"]
        counts[bucket] += 1
        for m in res["mode"].split("+"):
            modes[m] = modes.get(m, 0) + 1

    leader, summary = aggregate.aggregate()
    aggregate.write_json(DATA / "leaderboards.json", leader)
    aggregate.write_json(DATA / "summary.json", summary)

    mins = (time.time() - t0) / 60
    print(
        f"scanned {scanned} repos ({counts['request']} requested, {counts['new']} new, {counts['refresh']} refreshed; "
        f"modes {modes}) | {commits} commits | {gh.requests} requests ({gh.not_modified} not-modified) | "
        f"{mins:.1f} min | stop: {stop_reason} | errors {len(errors)} | "
        f"window {leader['window']} ai_share {summary['ai_share']:.3f}"
        f" over {summary['universe']['ranked']} ranked repos"
    )
    for e in errors[:20]:
        print(f"  error: {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
