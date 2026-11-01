from datetime import UTC, datetime

import aggregate
import validate
from scan_repo import write_json


def doc(repo, months, complete=True, window_start="2025-01-01", lang="Go"):
    return {
        "schema": 1,
        "repo": repo,
        "org": repo.split("/")[0],
        "language": lang,
        "stars": 10,
        "default_branch": "main",
        "scanned_at": "2026-11-01T00:00:00Z",
        "window_start": window_start,
        "complete": complete,
        "months": months,
    }


def m(total, ai, rule="claude_trailer"):
    return {"total": total, "ai": ai, "automation": 0, "merges": 0, "by_rule": {rule: ai} if ai else {}}


def test_window():
    assert aggregate.window_for(datetime(2026, 11, 1, tzinfo=UTC)) == ["2026-08", "2026-09", "2026-10"]
    assert aggregate.window_for(datetime(2026, 2, 15, tzinfo=UTC)) == ["2025-11", "2025-12", "2026-01"]


def test_aggregate_and_validate(tmp_path):
    w = {"2026-08": m(100, 50), "2026-09": m(100, 50), "2026-10": m(100, 80)}
    write_json(tmp_path / "repos" / "a__x.json", doc("a/x", w))
    write_json(tmp_path / "repos" / "a__y.json", doc("a/y", {k: m(20, 1) for k in w}))  # < 100 commits
    # Covers only from mid-September: excluded from the window, counted in trend for October only.
    write_json(
        tmp_path / "repos" / "b__z.json", doc("b/z", {"2026-09": m(500, 0), "2026-10": m(900, 0)}, False, "2026-09-12")
    )
    lb, sm = aggregate.aggregate(tmp_path, datetime(2026, 11, 1, tzinfo=UTC))
    assert [r["repo"] for r in lb["repos"]] == ["a/x"]
    assert lb["repos"][0]["ai_share"] == round(180 / 300, 4)
    assert lb["orgs"] == [{"org": "a", "ai_share": round(183 / 360, 4), "ai": 183, "total": 360, "repos": 2}]
    oct_ = next(t for t in lb["trend"] if t["month"] == "2026-10")
    assert oct_["total"] == 100 + 20 + 900 and oct_["repos"] == 3
    sep = next(t for t in lb["trend"] if t["month"] == "2026-09")
    assert sep["repos"] == 2
    write_json(tmp_path / "leaderboards.json", lb)
    write_json(tmp_path / "summary.json", sm)
    assert validate.main(tmp_path) == 0
