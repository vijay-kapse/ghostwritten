"""Check data/ against SCHEMA.md. Exits 1 and lists every problem found.

No jsonschema dependency: the checks are written out, including the arithmetic the web relies on
(ai <= total, by_rule ids known, leaderboard shares equal ai/total, ranking minimum respected).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from scan_repo import DATA, load_json
from signatures import RULE_IDS

MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TS = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
WINDOW = re.compile(r"^\d{4}-\d{2}\.\.\d{4}-\d{2}$")


class V:
    def __init__(self):
        self.errors: list[str] = []

    def check(self, cond, where, msg):
        if not cond:
            self.errors.append(f"{where}: {msg}")
        return cond

    def keys(self, obj, where, spec: dict):
        if not self.check(isinstance(obj, dict), where, "not an object"):
            return False
        ok = True
        for k, t in spec.items():
            if k not in obj:
                ok = self.check(False, where, f"missing {k}")
            elif not isinstance(obj[k], t) or (t is int and isinstance(obj[k], bool)):
                ok = self.check(False, where, f"{k} has type {type(obj[k]).__name__}")
        return ok


INT = int
NUM = (int, float)
STR_OR_NONE = (str, type(None))


def validate_repo(v: V, p: Path, d: dict) -> None:
    w = str(p.name)
    spec = {
        "schema": INT,
        "repo": str,
        "org": str,
        "language": STR_OR_NONE,
        "stars": INT,
        "default_branch": str,
        "scanned_at": str,
        "window_start": str,
        "complete": bool,
        "months": dict,
    }
    if not v.keys(d, w, spec):
        return
    v.check(d["schema"] == 1, w, "schema != 1")
    v.check(d["repo"].count("/") == 1, w, "repo is not owner/repo")
    v.check(p.name == d["repo"].replace("/", "__", 1) + ".json", w, "file name does not match repo")
    v.check(d["org"] == d["repo"].split("/")[0], w, "org != owner")
    v.check(TS.match(d["scanned_at"]), w, "scanned_at format")
    v.check(DATE.match(d["window_start"]) and d["window_start"] >= "2025-01-01", w, "window_start")
    if d["complete"]:
        v.check(d["window_start"] == "2025-01-01", w, "complete but window_start != 2025-01-01")
    for ym, m in d["months"].items():
        mw = f"{w} {ym}"
        v.check(MONTH.match(ym) and ym >= "2025-01", mw, "bad month key")
        if not v.keys(m, mw, {"total": INT, "ai": INT, "automation": INT, "merges": INT, "by_rule": dict}):
            continue
        v.check(0 <= m["ai"] <= m["total"], mw, "ai not in 0..total")
        v.check(m["automation"] >= 0 and m["merges"] >= 0, mw, "negative count")
        for rule, n in m["by_rule"].items():
            v.check(rule in RULE_IDS, mw, f"unknown rule {rule}")
            v.check(isinstance(n, int) and 0 < n <= m["ai"], mw, f"by_rule {rule}={n} outside 1..ai")
        v.check(sum(m["by_rule"].values()) >= m["ai"], mw, "sum(by_rule) < ai")
        v.check(m["ai"] == 0 or m["by_rule"], mw, "ai > 0 with empty by_rule")


def validate_rows(v: V, rows, where, spec, min_total=None, key="ai_share"):
    if not v.check(isinstance(rows, list), where, "not a list"):
        return
    prev = None
    for i, r in enumerate(rows):
        rw = f"{where}[{i}]"
        if not v.keys(r, rw, spec):
            continue
        if "total" in r:
            v.check(r["ai"] <= r["total"], rw, "ai > total")
            if key in r:
                exp = round(r["ai"] / r["total"], 4) if r["total"] else 0.0
                v.check(abs(r[key] - exp) < 1e-9, rw, f"ai_share {r[key]} != ai/total {exp}")
            if min_total is not None:
                v.check(r["total"] >= min_total, rw, f"total {r['total']} below ranking minimum")
        if min_total is not None and prev is not None:
            v.check(r[key] <= prev, rw, "not sorted by ai_share")
        prev = r.get(key)


def validate_leaderboards(v: V, d: dict) -> None:
    w = "leaderboards.json"
    spec = {
        "schema": INT,
        "generated_at": str,
        "universe": dict,
        "window": str,
        "repos": list,
        "orgs": list,
        "languages": list,
        "tools": list,
        "trend": list,
    }
    if not v.keys(d, w, spec):
        return
    v.check(TS.match(d["generated_at"]), w, "generated_at format")
    v.check(WINDOW.match(d["window"]), w, "window format")
    v.keys(d["universe"], f"{w} universe", {"repos": INT, "selection": str})
    validate_rows(
        v,
        d["repos"],
        f"{w} repos",
        {"repo": str, "ai_share": NUM, "ai": INT, "total": INT, "stars": INT, "language": STR_OR_NONE},
        min_total=100,
    )
    validate_rows(
        v, d["orgs"], f"{w} orgs", {"org": str, "ai_share": NUM, "ai": INT, "total": INT, "repos": INT}, min_total=100
    )
    validate_rows(
        v,
        d["languages"],
        f"{w} languages",
        {"language": str, "ai_share": NUM, "ai": INT, "total": INT, "repos": INT},
        min_total=100,
    )
    validate_rows(v, d["tools"], f"{w} tools", {"rule": str, "ai": INT})
    for i, t in enumerate(d["tools"]):
        v.check(t.get("rule") in RULE_IDS, f"{w} tools[{i}]", "unknown rule")
    validate_rows(v, d["trend"], f"{w} trend", {"month": str, "ai": INT, "total": INT, "ai_share": NUM})
    months = [t.get("month") for t in d["trend"]]
    v.check(months == sorted(months) and all(MONTH.match(m or "") for m in months), f"{w} trend", "month order")


def validate_summary(v: V, d: dict) -> None:
    w = "summary.json"
    spec = {
        "schema": INT,
        "generated_at": str,
        "universe": dict,
        "window": str,
        "ai_share": NUM,
        "median_repo_ai_share": NUM,
        "share_repos_with_ai": NUM,
        "mom_change": dict,
    }
    if not v.keys(d, w, spec):
        return
    for k in ("ai_share", "median_repo_ai_share", "share_repos_with_ai"):
        v.check(0 <= d[k] <= 1, w, f"{k} outside 0..1")
    v.keys(d["universe"], f"{w} universe", {"repos": INT})
    v.keys(d["mom_change"], f"{w} mom_change", {"from": str, "to": str, "change": NUM})


def main(data_dir: Path = DATA) -> int:
    v = V()
    repo_files = sorted((data_dir / "repos").glob("*.json"))
    for p in repo_files:
        d = load_json(p)
        if v.check(d is not None, p.name, "unreadable JSON"):
            validate_repo(v, p, d)
    for name, fn in (("leaderboards.json", validate_leaderboards), ("summary.json", validate_summary)):
        d = load_json(data_dir / name)
        if v.check(d is not None, name, "missing or unreadable"):
            fn(v, d)
    lb = load_json(data_dir / "leaderboards.json") or {}
    sm = load_json(data_dir / "summary.json") or {}
    v.check(lb.get("window") == sm.get("window"), "summary.json", "window differs from leaderboards.json")
    for e in v.errors:
        print("INVALID", e)
    print(f"validate: {len(repo_files)} repo files, leaderboards, summary: {len(v.errors)} problems")
    return 1 if v.errors else 0


if __name__ == "__main__":
    sys.exit(main())
