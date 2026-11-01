import { describe, expect, it } from "vitest";
import { classify, fromApiCommit, type ApiCommitLike } from "@/lib/attribution";
import parity from "@/fixtures/parity.json";

// fixtures/parity.json = scanner/signatures.py's own answers (npm run parity). The TS engine must agree on all.
describe("parity with scanner/signatures.py", () => {
  const cases = parity as unknown as { commit: ApiCommitLike; kind: string; rules: string[] }[];
  it(`agrees on all ${cases.length} cases`, () => {
    const bad = cases
      .map((c, i) => ({ i, got: classify(fromApiCommit(c.commit)), want: c }))
      .filter(({ got, want }) => got.kind !== want.kind || got.rules.join() !== want.rules.join());
    expect(bad.map((b) => ({ i: b.i, got: b.got, want: { kind: b.want.kind, rules: b.want.rules } }))).toEqual([]);
  });
  it("includes every category", () => {
    for (const k of ["ai", "human", "merge", "automation"]) expect(cases.some((c) => c.kind === k)).toBe(true);
  });
});
