"""scan_repo against an in-memory fake of the GitHub API."""

import scan_repo
from github import GitHubError


def mk(i, date, msg="change", login="alice", parents=1):
    return {
        "sha": f"{i:040d}",
        "parents": [{"sha": "p"}] * parents,
        "author": {"login": login},
        "committer": {"login": "web-flow"},
        "commit": {
            "message": msg,
            "author": {"name": login, "date": date},
            "committer": {"name": "GitHub", "date": date},
        },
    }


class R:
    def __init__(self, data, next_url=None, status=200):
        self.data, self.next_url, self.status = data, next_url, status


class FakeGH:
    """History is a list newest-first; `heads` maps head sha -> index where its history starts."""

    def __init__(self, history):
        self.history = history
        self.requests = 0

    def set_history(self, history):
        self.history = history

    def _from(self, sha):
        for i, c in enumerate(self.history):
            if c["sha"] == sha:
                return self.history[i:]
        raise GitHubError(404, sha)

    def get(self, path, params=None, cache=False, ok=(200,)):
        self.requests += 1
        params = params or {}
        if path.startswith("cmp:"):
            _, base, head, page = path.split(":")
            return self._compare(base, head, int(page))
        if path.endswith("/compare/" + path.split("/compare/")[-1]) and "/compare/" in path:
            base, head = path.split("/compare/")[1].split("...")
            return self._compare(base, head, 1)
        if path == "/repos/o/r":
            return R({"full_name": "o/r", "default_branch": "main", "stargazers_count": 5, "language": "Go"})
        if path == "/repos/o/r/commits":
            return R([self.history[0]] if self.history else [])
        raise AssertionError(path)

    def _compare(self, base, head, page):
        new = []
        for c in self._from(head):
            if c["sha"] == base:
                break
            new.append(c)
        else:
            raise GitHubError(404, base)
        new = new[::-1]
        chunk = new[(page - 1) * 100 : page * 100]
        nxt = f"cmp:{base}:{head}:{page + 1}" if page * 100 < len(new) else None
        return R({"status": "ahead" if new else "identical", "total_commits": len(new), "commits": chunk}, nxt)

    def paginate(self, path, params, max_pages=None, cache=False):
        rows = [
            c
            for c in self._from(params["sha"])
            if c["commit"]["committer"]["date"] >= params["since"]
            and ("until" not in params or c["commit"]["committer"]["date"] <= params["until"])
        ]
        n = 0
        for start in range(0, max(len(rows), 1), 100):
            if max_pages is not None and n >= max_pages:
                return
            n += 1
            self.requests += 1
            yield n, R(rows[start : start + 100], "next" if start + 100 < len(rows) else None)


def history(n, start_day=0):
    """n commits newest-first, one per hour, starting 2026-10-31 going back."""
    from datetime import datetime, timedelta

    t0 = datetime(2026, 10, 31, 23, 0, 0) - timedelta(hours=start_day)
    out = []
    for i in range(n):
        d = (t0 - timedelta(hours=7 * i)).strftime("%Y-%m-%dT%H:%M:%SZ")
        msg = "x\n\nCo-authored-by: Claude <noreply@anthropic.com>" if i % 4 == 0 else "x"
        out.append(mk(100000 + i, d, msg, parents=2 if i % 10 == 9 else 1))
    return out


def totals(doc):
    t = {"total": 0, "ai": 0, "merges": 0}
    for m in doc["months"].values():
        for k in t:
            t[k] += m[k]
    return t


def test_budget_then_backfill_then_incremental(tmp_path):
    h = history(2500)  # ~1.9 years at one commit per 7 hours, reaches before 2025-01
    in_window = [c for c in h if c["commit"]["committer"]["date"] >= scan_repo.WINDOW_START]
    gh = FakeGH(h)
    r1 = scan_repo.scan_repo(gh, "o/r", max_pages=5, data_dir=tmp_path)
    assert r1["complete"] is False and r1["commits"] == 500
    doc = scan_repo.load_json(scan_repo.repo_path("o/r", tmp_path))
    assert doc["window_start"] > "2025-01-01"
    for _ in range(10):
        r = scan_repo.scan_repo(gh, "o/r", max_pages=5, data_dir=tmp_path)
        if r["complete"]:
            break
    doc = scan_repo.load_json(scan_repo.repo_path("o/r", tmp_path))
    assert doc["complete"] is True and doc["window_start"] == "2025-01-01"
    t = totals(doc)
    assert t["total"] + t["merges"] == len(in_window)
    assert t["ai"] == sum(1 for c in in_window if "anthropic" in c["commit"]["message"] and len(c["parents"]) == 1)

    # 150 new commits land, some of them (from a merged branch) dated before the last scan.
    new = [mk(900000 + i, f"2026-11-01T{(i % 24):02d}:00:00Z", "y") for i in range(140)]
    old_dated = [
        mk(
            990000 + i,
            "2026-10-15T00:00:00Z",
            "z\n\nCo-authored-by: Copilot <1+Copilot@users.noreply.github.com>",
        )
        for i in range(10)
    ]
    gh.set_history(new + old_dated + h)
    r = scan_repo.scan_repo(gh, "o/r", max_pages=5, data_dir=tmp_path)
    assert r["mode"] == "incremental" and r["commits"] == 150
    doc2 = scan_repo.load_json(scan_repo.repo_path("o/r", tmp_path))
    assert doc2["months"]["2026-11"]["total"] == 140
    assert doc2["months"]["2026-10"]["by_rule"]["copilot_trailer"] == 10
    assert totals(doc2)["total"] == t["total"] + 150

    # Unchanged head: no commit pages fetched.
    r = scan_repo.scan_repo(gh, "o/r", max_pages=5, data_dir=tmp_path)
    assert r["mode"] == "unchanged" and r["pages"] == 0


def test_force_push_triggers_rescan(tmp_path):
    h = history(300)
    gh = FakeGH(h)
    scan_repo.scan_repo(gh, "o/r", max_pages=30, data_dir=tmp_path)
    rewritten = history(310, start_day=-24)
    for c in rewritten:
        c["sha"] = "f" + c["sha"][1:]
    gh.set_history(rewritten)
    r = scan_repo.scan_repo(gh, "o/r", max_pages=30, data_dir=tmp_path)
    assert r["mode"] == "rescan" and r["complete"]
    doc = scan_repo.load_json(scan_repo.repo_path("o/r", tmp_path))
    assert totals(doc)["total"] + totals(doc)["merges"] == 310


def test_empty_repo(tmp_path):
    gh = FakeGH([])
    r = scan_repo.scan_repo(gh, "o/r", data_dir=tmp_path)
    assert r["complete"] and r["mode"] == "empty"
