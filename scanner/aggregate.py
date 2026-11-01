"""Produce data/leaderboards.json and data/summary.json from data/repos/*.json (see SCHEMA.md).

- Window: the last 3 full calendar months before today (UTC). On 2026-11-01 that is 2026-08..2026-10.
- A repo counts for a month only if its scan covers that whole month: `complete=true`, or `window_start` on or
  before the first day of the month. Partially covered months are left out, never extrapolated.
- Repos, orgs, languages: pooled over the window (sum of ai / sum of total). Ranked only with >= 100 commits
  in the window (the denominator), sorted by ai_share, then by ai.
- tools: sum of `by_rule` over the window across covering repos. One commit can match several rules.
- trend: per month since 2025-01, pooled over the repos that cover that month (`repos` says how many).
"""

from __future__ import annotations

import argparse
import statistics
import sys
from datetime import UTC, datetime
from pathlib import Path

from scan_repo import DATA, load_json, now_iso, write_json

MIN_COMMITS = 100
FIRST_MONTH = "2025-01"


def month_add(ym: str, k: int) -> str:
    y, m = map(int, ym.split("-"))
    i = y * 12 + (m - 1) + k
    return f"{i // 12:04d}-{i % 12 + 1:02d}"


def months_between(a: str, b: str) -> list[str]:
    out, cur = [], a
    while cur <= b:
        out.append(cur)
        cur = month_add(cur, 1)
    return out


def window_for(today: datetime) -> list[str]:
    last = month_add(today.strftime("%Y-%m"), -1)
    return months_between(month_add(last, -2), last)


def covers(doc: dict, ym: str) -> bool:
    return bool(doc.get("complete")) or doc.get("window_start", "9999") <= f"{ym}-01"


def share(ai: int, total: int) -> float:
    return round(ai / total, 4) if total else 0.0


def pooled(docs: list[dict], months: list[str]) -> tuple[int, int]:
    ai = total = 0
    for d in docs:
        for ym in months:
            m = d["months"].get(ym)
            if m:
                ai += m["ai"]
                total += m["total"]
    return ai, total


def load_repos(data_dir: Path = DATA) -> list[dict]:
    docs = []
    for p in sorted((data_dir / "repos").glob("*.json")):
        d = load_json(p)
        if d and d.get("schema") == 1:
            docs.append(d)
    return docs


def aggregate(data_dir: Path = DATA, today: datetime | None = None) -> tuple[dict, dict]:
    today = today or datetime.now(UTC)
    window = window_for(today)
    docs = load_repos(data_dir)
    universe = load_json(data_dir / "universe.json") or {}
    n_universe = max(len(universe.get("repos", [])), len(docs))
    covering = [d for d in docs if all(covers(d, ym) for ym in window)]

    rows = []
    for d in covering:
        ai, total = pooled([d], window)
        rows.append(
            {
                "repo": d["repo"],
                "ai_share": share(ai, total),
                "ai": ai,
                "total": total,
                "stars": d.get("stars", 0),
                "language": d.get("language"),
            }
        )
    ranked = sorted((r for r in rows if r["total"] >= MIN_COMMITS), key=lambda r: (-r["ai_share"], -r["ai"]))

    def group(key):
        acc: dict[str, dict] = {}
        for d in covering:
            k = key(d)
            if not k:
                continue
            ai, total = pooled([d], window)
            g = acc.setdefault(k, {"ai": 0, "total": 0, "repos": 0})
            g["ai"] += ai
            g["total"] += total
            g["repos"] += 1
        return acc

    orgs = [{"org": k, "ai_share": share(g["ai"], g["total"]), **g} for k, g in group(lambda d: d["org"]).items()]
    langs = [
        {"language": k, "ai_share": share(g["ai"], g["total"]), **g}
        for k, g in group(lambda d: d.get("language")).items()
    ]
    orgs = sorted((o for o in orgs if o["total"] >= MIN_COMMITS), key=lambda r: (-r["ai_share"], -r["ai"]))
    langs = sorted((x for x in langs if x["total"] >= MIN_COMMITS), key=lambda r: (-r["ai_share"], -r["ai"]))

    tools: dict[str, int] = {}
    for d in covering:
        for ym in window:
            for rule, n in (d["months"].get(ym) or {}).get("by_rule", {}).items():
                tools[rule] = tools.get(rule, 0) + n
    tools_rows = [{"rule": k, "ai": v} for k, v in sorted(tools.items(), key=lambda kv: (-kv[1], kv[0]))]

    trend = []
    for ym in months_between(FIRST_MONTH, window[-1]):
        ds = [d for d in docs if covers(d, ym)]
        ai, total = pooled(ds, [ym])
        trend.append({"month": ym, "ai": ai, "total": total, "ai_share": share(ai, total), "repos": len(ds)})

    generated = now_iso()
    selection = "top by stars, plus on-demand lookups"
    win = f"{window[0]}..{window[-1]}"
    leader = {
        "schema": 1,
        "generated_at": generated,
        "universe": {"repos": n_universe, "selection": selection},
        "window": win,
        "repos": ranked,
        "orgs": orgs,
        "languages": langs,
        "tools": tools_rows,
        "trend": trend,
    }

    ai, total = pooled(covering, window)
    shares = [r["ai_share"] for r in ranked]
    # Month-over-month: last window month vs the one before, over repos that cover both.
    last, prev = window[-1], window[-2]
    both = [d for d in docs if covers(d, last) and covers(d, prev)]
    a1, t1 = pooled(both, [prev])
    a2, t2 = pooled(both, [last])
    summary = {
        "schema": 1,
        "generated_at": generated,
        "universe": {
            "repos": n_universe,
            "scanned": len(docs),
            "covering_window": len(covering),
            "ranked": len(ranked),
            "selection": selection,
        },
        "window": win,
        "ai": ai,
        "total": total,
        "ai_share": share(ai, total),
        "median_repo_ai_share": round(statistics.median(shares), 4) if shares else 0.0,
        "share_repos_with_ai": share(sum(1 for r in ranked if r["ai"] > 0), len(ranked)),
        "mom_change": {
            "from": prev,
            "to": last,
            "from_share": share(a1, t1),
            "to_share": share(a2, t2),
            "change": round(share(a2, t2) - share(a1, t1), 4),
            "repos": len(both),
        },
        "min_commits": MIN_COMMITS,
    }
    return leader, summary


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Write data/leaderboards.json and data/summary.json")
    ap.add_argument("--data-dir", type=Path, default=DATA)
    ap.add_argument("--today", help="YYYY-MM-DD, for reproducing a past window")
    a = ap.parse_args(argv)
    today = datetime.strptime(a.today, "%Y-%m-%d").replace(tzinfo=UTC) if a.today else None
    leader, summary = aggregate(a.data_dir, today)
    write_json(a.data_dir / "leaderboards.json", leader)
    write_json(a.data_dir / "summary.json", summary)
    print(
        f"aggregate: window {leader['window']}, {summary['universe']['ranked']} ranked repos, "
        f"pooled ai_share {summary['ai_share']:.3f} ({summary['ai']}/{summary['total']})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
