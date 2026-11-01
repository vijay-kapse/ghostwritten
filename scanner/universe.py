"""Build or refresh data/universe.json: the repos the nightly scan covers.

Sources:
- top repos by stars from the search API (`stars:>1000`, non-fork). Search returns at most 1,000 results per
  query, so the star range is narrowed after each 1,000 (`stars:1000..{lowest seen}`) until `--top` repos are in.
  Refreshed when older than `--max-age-days` (default 7); search has its own 30 requests/minute limit.
- on-demand lookups from data/requests.log, one per line: `owner/repo` or `user:login`. A `user:login` line
  adds that user's 10 most recently pushed public, non-fork repos (what the web's /u/{login} page reads).
  Each new line costs one core request; lines already resolved are not looked up again.
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import UTC, datetime, timedelta

from github import GitHub, GitHubError
from scan_repo import DATA, load_json, now_iso, write_json

UNIVERSE = DATA / "universe.json"
REQUESTS_LOG = DATA / "requests.log"
TOP_N = 5000
MIN_STARS = 1000
REPO_RE = re.compile(r"^[A-Za-z0-9-]{1,39}/[A-Za-z0-9._-]{1,100}$")
USER_RE = re.compile(r"^user:([A-Za-z0-9-]{1,39})$")


def entry(item: dict, source: str) -> dict:
    return {
        "repo": item["full_name"],
        "stars": item.get("stargazers_count", 0),
        "language": item.get("language"),
        "default_branch": item.get("default_branch"),
        "archived": bool(item.get("archived")),
        "fork": bool(item.get("fork")),
        "source": source,
    }


def search_top(gh: GitHub, n: int = TOP_N, min_stars: int = MIN_STARS) -> list[dict]:
    found: dict[str, dict] = {}
    hi = None
    while len(found) < n:
        q = f"stars:>{min_stars}" if hi is None else f"stars:{min_stars + 1}..{hi}"
        before = len(found)
        lowest = None
        for _, resp in gh.paginate(
            "/search/repositories", {"q": q, "sort": "stars", "order": "desc", "per_page": 100}, max_pages=10
        ):
            items = (resp.data or {}).get("items") or []
            for it in items:
                if it.get("fork"):
                    continue
                found.setdefault(it["full_name"].lower(), entry(it, "stars"))
                s = it.get("stargazers_count", 0)
                lowest = s if lowest is None else min(lowest, s)
            if len(found) >= n or not items:
                break
        if lowest is None or lowest <= min_stars + 1:
            break
        # Next query starts at the lowest star count seen (inclusive, ties are de-duplicated). If a whole
        # query added nothing new (a tie block bigger than 1,000), step below it.
        hi = lowest if len(found) > before else lowest - 1
    top = sorted(found.values(), key=lambda e: -e["stars"])[:n]
    return top


def read_requests(path=REQUESTS_LOG) -> list[str]:
    if not path.exists():
        return []
    out, seen = [], set()
    for line in path.read_text().splitlines():
        tok = line.strip().split()[0] if line.strip() else ""
        if not tok or tok.startswith("#"):
            continue
        tok = tok.removeprefix("https://github.com/").rstrip("/")
        if (REPO_RE.match(tok) or USER_RE.match(tok)) and tok.lower() not in seen:
            seen.add(tok.lower())
            out.append(tok)
    return out


def resolve_requests(gh: GitHub, lines: list[str], known: dict, resolved: set) -> tuple[list[dict], list[str]]:
    """Look up request lines not resolved before. Returns (new entries, lines now resolved)."""
    new, done = [], []
    for tok in lines:
        if tok.lower() in resolved:
            continue
        try:
            m = USER_RE.match(tok)
            if m:
                resp = gh.get(f"/users/{m.group(1)}/repos", {"sort": "pushed", "per_page": 30, "type": "owner"})
                repos = [r for r in (resp.data or []) if not r.get("fork") and not r.get("private")][:10]
                for r in repos:
                    if r["full_name"].lower() not in known:
                        new.append(entry(r, "request"))
            elif tok.lower() not in known:
                r = gh.get(f"/repos/{tok}", cache=True).data
                if not r.get("private"):
                    new.append(entry(r, "request"))
        except GitHubError as e:
            if e.status not in (404, 451):
                raise
        done.append(tok.lower())
        for e in new:
            known[e["repo"].lower()] = e
    return new, done


def build(gh: GitHub, top: int = TOP_N, max_age_days: float = 7, force: bool = False) -> dict:
    cur = load_json(UNIVERSE) or {}
    repos = {e["repo"].lower(): e for e in cur.get("repos", [])}
    stale = force or not cur.get("top_refreshed_at")
    if not stale:
        age = datetime.now(UTC) - datetime.strptime(cur["top_refreshed_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)
        stale = age > timedelta(days=max_age_days)
    top_refreshed_at = cur.get("top_refreshed_at")
    if stale:
        fresh = search_top(gh, top)
        requested = {k: e for k, e in repos.items() if e.get("source") == "request"}
        repos = {e["repo"].lower(): e for e in fresh}
        for k, e in requested.items():
            repos.setdefault(k, e)
        top_refreshed_at = now_iso()
    resolved = set(cur.get("resolved_requests", []))
    _, done = resolve_requests(gh, read_requests(), repos, resolved)
    resolved |= set(done)
    doc = {
        "schema": 1,
        "generated_at": now_iso(),
        "top_refreshed_at": top_refreshed_at,
        "selection": f"top {top} by stars (search stars:>{MIN_STARS}, non-fork), plus on-demand lookups",
        "repos": sorted(repos.values(), key=lambda e: (e["source"] != "request", -e["stars"], e["repo"])),
        "resolved_requests": sorted(resolved),
    }
    write_json(UNIVERSE, doc)
    return doc


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Build/refresh data/universe.json")
    ap.add_argument("--top", type=int, default=TOP_N)
    ap.add_argument("--max-age-days", type=float, default=7)
    ap.add_argument("--force", action="store_true", help="refresh the top-by-stars list now")
    a = ap.parse_args(argv)
    gh = GitHub()
    doc = build(gh, a.top, a.max_age_days, a.force)
    n_req = sum(1 for e in doc["repos"] if e["source"] == "request")
    print(f"universe: {len(doc['repos'])} repos ({n_req} from requests), {gh.requests} requests")
    return 0


if __name__ == "__main__":
    sys.exit(main())
