import { after } from "next/server";
import { badgeSvg, shareBadge, UNAVAILABLE_COLOR } from "@/lib/badge";
import { computeRepo, pooled } from "@/lib/compute";
import { GithubError } from "@/lib/github";
import { pctWhole } from "@/lib/format";
import { logRequest } from "@/lib/requestlog";
import { isOwner, isRepoName } from "@/lib/slug";

const OK_CACHE = "public, s-maxage=86400, stale-while-revalidate=604800";
const SHORT_CACHE = "public, s-maxage=300, stale-while-revalidate=3600";

function svg(body: string, status: number, cache: string) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": cache },
  });
}

export async function GET(_req: Request, ctx: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo: rawRepo } = await ctx.params;
  const repo = rawRepo.replace(/\.svg$/i, "");
  if (!isOwner(owner) || !isRepoName(repo)) return svg(badgeSvg("invalid repo", UNAVAILABLE_COLOR), 400, SHORT_CACHE);

  try {
    const data = await computeRepo(owner, repo, { meta: false });
    const p = pooled(data);
    after(() => logRequest(`${owner}/${repo}`));
    if (p.total === 0) return svg(badgeSvg("no commits", UNAVAILABLE_COLOR), 200, OK_CACHE);
    return svg(shareBadge(p.share, pctWhole(p.share)), 200, OK_CACHE);
  } catch (e) {
    if (e instanceof GithubError && e.status === 404) return svg(badgeSvg("not found", UNAVAILABLE_COLOR), 404, SHORT_CACHE);
    return svg(badgeSvg("unavailable", UNAVAILABLE_COLOR), 200, SHORT_CACHE);
  }
}
