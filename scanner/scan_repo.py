"""Scan one repository's default branch and write data/repos/{owner}__{repo}.json (see SCHEMA.md).

How a run works (at most `max_pages` pages of 100 commits per run):

1. First scan: list commits newest-first from the current head, committer date >= 2025-01-01.
   If the budget runs out first, `complete=false` and `window_start` is the oldest commit date seen.
2. Later scans, forward: compare the last scanned head with the current head
   (GET /compare/{old}...{new}). That returns exactly the commits that became reachable, including
   commits from merged branches whose dates are older than the last scan, so nothing is missed or
   counted twice. If the old head is gone (force push) or the gap is bigger than the budget, the repo is
   rescanned from scratch.
3. Later scans, backfill: while `complete=false`, keep listing older commits (until = oldest seen) with
   whatever budget is left, so big repos reach 2025-01 over several nightly runs.

Months are bucketed by committer date in UTC, the same date GitHub's `since`/`until` filter on.
Scanner bookkeeping (last head SHA, exact oldest timestamp) lives in data/state/, which the web ignores.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

from github import GitHub, GitHubError
from signatures import classify

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
WINDOW_START = "2025-01-01T00:00:00Z"
MAX_PAGES = 30
PER_PAGE = 100


def now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def slug(full_name: str) -> str:
    owner, repo = full_name.split("/", 1)
    return f"{owner}__{repo}"


def repo_path(full_name: str, data_dir: Path = DATA) -> Path:
    return data_dir / "repos" / f"{slug(full_name)}.json"


def state_path(full_name: str, data_dir: Path = DATA) -> Path:
    return data_dir / "state" / f"{slug(full_name)}.json"


def load_json(p: Path):
    try:
        return json.loads(p.read_text())
    except (OSError, ValueError):
        return None


def write_json(p: Path, obj) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj, indent=2, sort_keys=False) + "\n")
    tmp.replace(p)


def empty_month() -> dict:
    return {"total": 0, "ai": 0, "automation": 0, "merges": 0, "by_rule": {}}


def commit_date(c: dict) -> str:
    cc = c.get("commit") or {}
    return ((cc.get("committer") or {}).get("date")) or ((cc.get("author") or {}).get("date")) or ""


def add_commit(months: dict, c: dict) -> str:
    """Count one commit into its month. Returns its category."""
    cat, rules = classify(c)
    m = months.setdefault(commit_date(c)[:7], empty_month())
    if cat == "merge":
        m["merges"] += 1
    elif cat == "automation":
        m["automation"] += 1
    else:
        m["total"] += 1
        if cat == "ai":
            m["ai"] += 1
            for r in rules:
                m["by_rule"][r] = m["by_rule"].get(r, 0) + 1
    return cat


def minus_one_second(iso: str) -> str:
    t = datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ") - timedelta(seconds=1)
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


class Scan:
    """One run over one repo. Use `scan_repo()`."""

    def __init__(self, gh: GitHub, full_name: str, data_dir: Path, max_pages: int):
        self.gh = gh
        self.full = full_name
        self.data_dir = data_dir
        self.pages_left = max_pages
        self.pages = 0
        self.commits = 0
        self.modes: list[str] = []

    def _walk(self, months: dict, head: str, until: str | None) -> tuple[str | None, bool]:
        """List commits newest-first from `head` back to WINDOW_START (optionally <= until).

        Returns (oldest committer date seen, whether the listing was exhausted)."""
        params = {"sha": head, "since": WINDOW_START, "per_page": PER_PAGE}
        if until:
            params["until"] = until
        oldest, exhausted = None, False
        if self.pages_left <= 0:
            return None, False
        for _, resp in self.gh.paginate(f"/repos/{self.full}/commits", params, max_pages=self.pages_left):
            self.pages_left -= 1
            self.pages += 1
            for c in resp.data or []:
                d = commit_date(c)
                if d < WINDOW_START:
                    continue
                add_commit(months, c)
                self.commits += 1
                oldest = d if oldest is None or d < oldest else oldest
            if not resp.next_url or not resp.data:
                exhausted = True
                break
        return oldest, exhausted

    def _compare(self, months: dict, base: str, head: str, floor: str) -> bool:
        """Count commits reachable from head but not base. False if a rescan is needed."""
        url = f"/repos/{self.full}/compare/{base}...{head}"
        try:
            first = self.gh.get(url, {"per_page": PER_PAGE}, ok=(200,))
        except GitHubError as e:
            if e.status in (404, 422):
                return False
            raise
        self.pages_left -= 1
        self.pages += 1
        d = first.data
        if d.get("status") != "ahead":
            return d.get("status") == "identical"
        total = int(d.get("total_commits") or 0)
        need = -(-total // PER_PAGE)
        if need - 1 > self.pages_left:
            return False
        batches = [d.get("commits") or []]
        nxt = first.next_url
        while nxt:
            r = self.gh.get(nxt)
            self.pages_left -= 1
            self.pages += 1
            batches.append(r.data.get("commits") or [])
            nxt = r.next_url
        seen = sum(len(b) for b in batches)
        if seen < total:  # compare did not hand back every commit; do not trust a partial count
            return False
        for b in batches:
            for c in b:
                dt = commit_date(c)
                # Older than the covered window: the backfill walk from the new head will count it.
                if dt < floor:
                    continue
                add_commit(months, c)
                self.commits += 1
        return True

    def run(self, meta: dict | None = None, fresh: bool = False) -> dict:
        t0 = time.time()
        req0 = self.gh.requests
        if meta is None:
            try:
                meta = self.gh.get(f"/repos/{self.full}", cache=True).data
            except GitHubError as e:
                return {"repo": self.full, "error": f"repo lookup failed ({e.status})", "requests": 1}
        full = meta["full_name"]
        self.full = full
        branch = meta.get("default_branch") or "main"
        rpath, spath = repo_path(full, self.data_dir), state_path(full, self.data_dir)
        existing = None if fresh else load_json(rpath)
        state = None if fresh else load_json(spath)
        if existing and state and existing.get("default_branch") != branch:
            existing = state = None  # default branch changed: start over
        if not (existing and state and state.get("head_sha")):
            existing = state = None

        # Current head of the default branch (conditional request: unchanged heads cost nothing).
        try:
            head_resp = self.gh.get(f"/repos/{full}/commits", {"sha": branch, "per_page": 1}, cache=True, ok=(200, 409))
        except GitHubError as e:
            return {
                "repo": full,
                "error": f"head lookup failed ({e.status})",
                "requests": self.gh.requests - req0,
            }
        empty_repo = head_resp.status == 409 or not head_resp.data
        head = None if empty_repo else head_resp.data[0]["sha"]

        months = existing["months"] if existing else {}
        complete = bool(state["complete"]) if state else False
        oldest = state.get("oldest") if state else None

        if empty_repo:
            months, complete, oldest, self.modes = {}, True, WINDOW_START, ["empty"]
        elif state is None:
            self.modes.append("new")
            o, exhausted = self._walk(months, head, None)
            complete, oldest = (True, WINDOW_START) if exhausted else (False, o)
        else:
            if head != state["head_sha"]:
                floor = WINDOW_START if complete else oldest
                ok = self._compare(months, state["head_sha"], head, floor)
                if ok:
                    self.modes.append("incremental")
                else:
                    self.modes.append("rescan")
                    months = {}
                    o, exhausted = self._walk(months, head, None)
                    complete, oldest = (True, WINDOW_START) if exhausted else (False, o)
            else:
                self.modes.append("unchanged")

        if not complete and oldest and self.pages_left > 0 and head:
            self.modes.append("backfill")
            o, exhausted = self._walk(months, head, minus_one_second(oldest))
            if exhausted:
                complete, oldest = True, WINDOW_START
            elif o:
                oldest = min(oldest, o)

        if oldest is None:  # budget was zero before anything was read
            return {"repo": full, "error": "no budget", "requests": self.gh.requests - req0}

        out = {
            "schema": 1,
            "repo": full,
            "org": full.split("/")[0],
            "language": meta.get("language"),
            "stars": meta.get("stargazers_count", 0),
            "default_branch": branch,
            "scanned_at": now_iso(),
            "window_start": WINDOW_START[:10] if complete else oldest[:10],
            "complete": complete,
            "months": {k: months[k] for k in sorted(months)},
        }
        for m in out["months"].values():
            m["by_rule"] = dict(sorted(m["by_rule"].items(), key=lambda kv: (-kv[1], kv[0])))
        write_json(rpath, out)
        write_json(
            spath,
            {
                "schema": 1,
                "repo": full,
                "head_sha": head,
                "oldest": oldest,
                "complete": complete,
                "default_branch": branch,
                "updated_at": out["scanned_at"],
            },
        )
        return {
            "repo": full,
            "mode": "+".join(self.modes),
            "pages": self.pages,
            "commits": self.commits,
            "requests": self.gh.requests - req0,
            "seconds": round(time.time() - t0, 1),
            "complete": complete,
            "window_start": out["window_start"],
        }


def scan_repo(
    gh: GitHub,
    full_name: str,
    meta: dict | None = None,
    max_pages: int = MAX_PAGES,
    data_dir: Path = DATA,
    fresh: bool = False,
) -> dict:
    return Scan(gh, full_name, data_dir, max_pages).run(meta=meta, fresh=fresh)


def share(doc: dict, first: str, last: str) -> tuple[int, int]:
    ai = total = 0
    for k, m in doc["months"].items():
        if first <= k <= last:
            ai += m["ai"]
            total += m["total"]
    return ai, total


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("repo", nargs="+", help="owner/repo")
    ap.add_argument("--max-pages", type=int, default=MAX_PAGES, help="pages of 100 commits per run")
    ap.add_argument(
        "--until-complete",
        action="store_true",
        help="repeat runs (each within --max-pages) until the window back to 2025-01 is covered",
    )
    ap.add_argument("--fresh", action="store_true", help="ignore existing data and state for this repo")
    ap.add_argument("--data-dir", type=Path, default=DATA)
    ap.add_argument("--months", default=None, help="print the AI share for a month range, e.g. 2026-08..2026-10")
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args(argv)
    gh = GitHub(verbose=a.verbose)
    rc = 0
    for name in a.repo:
        fresh = a.fresh
        while True:
            res = scan_repo(gh, name, max_pages=a.max_pages, data_dir=a.data_dir, fresh=fresh)
            fresh = False
            print(json.dumps(res))
            if "error" in res:
                rc = 1
                break
            if res["complete"] or not a.until_complete:
                break
        if a.months and "error" not in res:
            first, last = a.months.split("..")
            doc = load_json(repo_path(res["repo"], a.data_dir))
            ai, total = share(doc, first, last)
            pct = f"{100 * ai / total:.1f}%" if total else "n/a"
            print(
                f"{res['repo']} {a.months}: {ai}/{total} AI-attributed = {pct}"
                f" (complete={doc['complete']}, window_start={doc['window_start']})"
            )
    return rc


if __name__ == "__main__":
    sys.exit(main())
