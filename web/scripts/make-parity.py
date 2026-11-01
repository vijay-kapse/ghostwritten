"""Regenerates fixtures/parity.json: commits plus what scanner/signatures.py says about each.
tests/parity.test.ts asserts the TypeScript port gives identical answers. Run: npm run parity"""
import itertools
import json
import sys
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(WEB.parent / "scanner"))
import signatures  # noqa: E402

cases = []
scanner_fix = WEB.parent / "scanner" / "tests" / "fixtures" / "commits.json"
if scanner_fix.exists():
    cases += [c["commit"] for c in json.loads(scanner_fix.read_text())]

def commit(msg, login=None, name=None, clogin=None, cname=None, parents=1):
    return {
        "parents": [{}] * parents,
        "author": {"login": login} if login else None,
        "committer": {"login": clogin} if clogin else None,
        "commit": {"message": msg, "author": {"name": name}, "committer": {"name": cname}},
    }

for f in json.loads((WEB / "fixtures" / "commit-messages.json").read_text()):
    cases.append(commit(f["message"], f.get("author_login"), f.get("author_name"),
                        f.get("committer_login"), f.get("committer_name"), f.get("parents", 1)))

# Cross product of messages and identities to stress every matcher kind.
messages = [
    "Fix bug", "aider: tweak", "Fix cursor position", "Claude Shannon notes",
    "x\n\nCo-authored-by: Claude Code <noreply@anthropic.com>",
    "x\n\nCo-Authored-By: Alice <a@b.c>\r\nCo-authored-by: Codex <c@d.e>",
    "x\n\n> Co-authored-by: Cursor Agent <cursoragent@cursor.com>",
    "x\n\nGenerated\nwith [Claude Code]", "x\n\nCopilot-Session: abc", "x\n\nAuthored with GitHub Copilot",
    "x\n\nCo-authored-by: devin ai <d@e.f>", "x\n\nCo-authored-by: Jules <j@example.com>",
    "x\n\nCo-authored-by: gemini-cli <g@h.i>", "x\n\nCo-authored-by: OpenHands <o@all-hands.dev>",
    "x\n\nCo-authored-by: Amp <noreply@ampcode.com>", "x\n\nCo-authored-by: a <noreply@openai.com>",
    "Merge branch 'main'", "",
]
idents = [
    (None, None), ("jdoe", "Jane Doe"), ("dependabot[bot]", "dependabot[bot]"), ("claude[bot]", None),
    ("sweep-ai[bot]", None), ("copilot-swe-agent[bot]", "Copilot"), ("random-unlisted[bot]", None),
    ("Copilot", None), ("kp", "Kiran (aider)"), ("web-flow", "GitHub"), ("renovate[bot]", None),
    ("cursor[bot]", "Cursor Agent"), ("OpenHands-Agent[bot]", None),
]
for m, (lg, nm), parents in itertools.product(messages, idents, (1, 2)):
    cases.append(commit(m, lg, nm, "web-flow", "GitHub", parents))

out = []
for c in cases:
    cat, rules = signatures.classify(c)
    out.append({"commit": c, "kind": cat, "rules": rules})
(WEB / "fixtures" / "parity.json").write_text(json.dumps(out, indent=1) + "\n")
print(f"{len(out)} parity cases")
