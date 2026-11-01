import { describe, expect, it } from "vitest";
import { classify, createEngine, engine, matchRules, toolForRule, type FlatCommit } from "@/lib/attribution";
import fixtures from "@/fixtures/commit-messages.json";

interface Fixture extends FlatCommit {
  name: string;
  expect: { kind: string; rules: string[] };
}

describe("hand-written fixture messages", () => {
  for (const f of fixtures as Fixture[]) {
    it(f.name, () => {
      expect(classify(f)).toEqual({ kind: f.expect.kind, rules: f.expect.rules });
    });
  }
  it("covers the eight required cases", () => {
    expect((fixtures as Fixture[]).length).toBeGreaterThanOrEqual(8);
  });
});

describe("engine details", () => {
  it("parses co-authored-by trailers case-insensitively", () => {
    const m = "x\n\nco-authored-by: A <a@b.c>\nCo-Authored-By: D <d@e.f>".match(engine.trailerLine);
    expect(m).toHaveLength(2);
  });
  it("does not match a human co-author", () => {
    expect(matchRules({ message: "x\n\nCo-authored-by: Alice <alice@example.com>" })).toEqual([]);
  });
  it("matches a Copilot trailer separately from the bot-author rule", () => {
    expect(
      matchRules({ message: "x\n\nCo-authored-by: Copilot <175728472+Copilot@users.noreply.github.com>" }),
    ).toEqual(["copilot_trailer"]);
  });
  it("treats unlisted bots as automation, never AI", () => {
    expect(classify({ message: "chore: release", author_login: "some-unlisted[bot]", parents: 1 }).kind).toBe("automation");
  });
  it("automation wins over an AI trailer on the same commit", () => {
    const c = { message: "x\n\nCo-authored-by: Claude <noreply@anthropic.com>", author_login: "dependabot[bot]", parents: 1 };
    expect(classify(c).kind).toBe("automation");
  });
  it("counts an allowlisted agent bot once as other_bot_agent", () => {
    expect(classify({ message: "fix", author_login: "sweep-ai[bot]", parents: 1 })).toEqual({
      kind: "ai",
      rules: ["other_bot_agent"],
    });
  });
  it("maps rules to tools", () => {
    expect(toolForRule("claude_generated")).toBe(toolForRule("claude_trailer"));
    expect(toolForRule("unknown_rule")).toBe("unknown_rule");
  });
  it("builds an engine from any signatures file", () => {
    const e = createEngine({
      ...engine.signatures,
      rules: [{ id: "only", tool: "T", body: ["zzz"] }],
    });
    expect(e.classify({ message: "has ZZZ", parents: 1 })).toEqual({ kind: "ai", rules: ["only"] });
  });
  it("exposes the twelve SCHEMA rule ids in order", () => {
    expect(engine.rules.map((r) => r.id)).toEqual([
      "claude_trailer", "claude_generated", "copilot_trailer", "copilot_author", "codex_trailer", "cursor",
      "devin", "gemini", "aider", "openhands", "amp_factory", "other_bot_agent",
    ]);
  });
});
