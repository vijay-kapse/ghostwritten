import { NextResponse } from "next/server";
import { toolForRule } from "@/lib/attribution";
import { computeRepo, pooled, ruleTotals, toolTotals } from "@/lib/compute";
import { GithubError } from "@/lib/github";
import { isOwner, isRepoName } from "@/lib/slug";

const OK_CACHE = "public, s-maxage=86400, stale-while-revalidate=604800";
const SHORT_CACHE = "public, s-maxage=60";

export async function GET(_req: Request, ctx: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo: rawRepo } = await ctx.params;
  const repo = rawRepo.replace(/\.json$/i, "");
  if (!isOwner(owner) || !isRepoName(repo)) {
    return NextResponse.json({ error: "invalid repo" }, { status: 400, headers: { "Cache-Control": SHORT_CACHE } });
  }
  try {
    const data = await computeRepo(owner, repo);
    const p = pooled(data);
    const rules = ruleTotals(data).map((r) => ({ ...r, tool: toolForRule(r.rule) }));
    return NextResponse.json(
      {
        ...data,
        summary: { ai: p.ai, total: p.total, ai_share: p.share, automation: p.automation, merges: p.merges },
        by_rule: rules,
        by_tool: toolTotals(rules),
      },
      { headers: { "Cache-Control": OK_CACHE } },
    );
  } catch (e) {
    if (e instanceof GithubError) {
      const status = e.rateLimited ? 429 : e.status === 404 ? 404 : 502;
      return NextResponse.json({ error: e.message }, { status, headers: { "Cache-Control": SHORT_CACHE } });
    }
    return NextResponse.json({ error: "internal error" }, { status: 500, headers: { "Cache-Control": SHORT_CACHE } });
  }
}
