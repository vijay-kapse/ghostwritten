import { describe, expect, it } from "vitest";
import { badgeSvg, shareBadge } from "@/lib/badge";
import { badgeColor, pctWhole } from "@/lib/format";
import { parseLoginInput, parseRepoInput } from "@/lib/slug";

describe("badge", () => {
  it("uses the SCHEMA colour scale at its boundaries", () => {
    expect(badgeColor(0.049)).toBe("#7b8088"); // grey < 5%
    expect(badgeColor(0.05)).toBe("#2f6fdb"); // blue < 25%
    expect(badgeColor(0.249)).toBe("#2f6fdb");
    expect(badgeColor(0.25)).toBe("#e8892b"); // orange < 50%
    expect(badgeColor(0.499)).toBe("#e8892b");
    expect(badgeColor(0.5)).toBe("#d3392f"); // red >= 50%
  });
  it("renders `ghostwritten | 23% AI`", () => {
    const svg = shareBadge(0.23, pctWhole(0.23));
    expect(svg).toContain('aria-label="ghostwritten: 23% AI"');
    expect(svg).toContain("#2f6fdb");
    expect(svg.startsWith("<svg")).toBe(true);
  });
  it("escapes text", () => {
    expect(badgeSvg("<x>", "#000")).not.toContain("<x>");
  });
  it("shows <1% for tiny shares", () => {
    expect(pctWhole(0.004)).toBe("<1%");
    expect(pctWhole(0)).toBe("0%");
  });
});

describe("input parsing", () => {
  it("parses repo inputs", () => {
    expect(parseRepoInput("vercel/next.js")).toEqual({ owner: "vercel", repo: "next.js" });
    expect(parseRepoInput("https://github.com/vercel/next.js.git")).toEqual({ owner: "vercel", repo: "next.js" });
    expect(parseRepoInput("github.com/a/b/tree/main")).toEqual({ owner: "a", repo: "b" });
    expect(parseRepoInput("only")).toBeNull();
  });
  it("parses logins", () => {
    expect(parseLoginInput("@gaearon")).toBe("gaearon");
    expect(parseLoginInput("https://github.com/gaearon?tab=repos")).toBe("gaearon");
    expect(parseLoginInput("not valid")).toBeNull();
  });
});
