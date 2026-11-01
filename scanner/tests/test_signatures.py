import json
import re
from pathlib import Path

import pytest

import signatures
from signatures import RULE_IDS, classify

FIX = json.loads((Path(__file__).parent / "fixtures" / "commits.json").read_text())


@pytest.mark.parametrize("case", FIX, ids=[f["name"] for f in FIX])
def test_fixture(case):
    cat, rules = classify(case["commit"])
    assert cat == case["expect"], (cat, rules)
    assert sorted(rules) == sorted(case["rules"])


def test_rule_ids_match_schema():
    assert RULE_IDS == [
        "claude_trailer",
        "claude_generated",
        "copilot_trailer",
        "copilot_author",
        "codex_trailer",
        "cursor",
        "devin",
        "gemini",
        "aider",
        "openhands",
        "amp_factory",
        "other_bot_agent",
    ]


def test_json_export_is_current():
    on_disk = json.loads(signatures.JSON_PATH.read_text())
    assert on_disk == json.loads(json.dumps(signatures.export())), "run: python signatures.py"


def test_patterns_are_js_compatible():
    exp = signatures.export()
    pats = [exp["trailer_line"]]
    for r in exp["rules"]:
        for k in ("trailer", "body", "subject", "names"):
            pats += r.get(k, [])
    for p in pats:
        assert "(?" not in p, p  # no inline flags, named groups or lookarounds
        re.compile(p)


def test_no_overlap_between_automation_and_agents():
    assert not set(signatures.AUTOMATION) & set(signatures.AGENT_BOTS)


def test_other_bot_agent_is_explicit():
    r = next(r for r in signatures.RULES if r["id"] == "other_bot_agent")
    assert r["logins"] and all(x.endswith("[bot]") and "*" not in x for x in r["logins"])
