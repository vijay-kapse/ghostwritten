import { NextResponse } from "next/server";
import { gh, GithubError } from "@/lib/github";
import { logRequest, requestKey } from "@/lib/requestlog";

/**
 * POST { "repo": "owner/name" } or { "user": "login" } (or { "key": "..." }).
 * Appends the key to data/requests.log on GitHub so the nightly scan adds it to the universe.
 * Fails silently: the response never reveals whether the token is configured.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // fall through to validation
  }
  const raw =
    typeof body.key === "string"
      ? body.key
      : typeof body.repo === "string"
        ? body.repo
        : typeof body.user === "string"
          ? `user:${body.user}`
          : "";
  const key = requestKey(raw);
  if (!key) return NextResponse.json({ ok: false, error: "invalid key" }, { status: 400 });

  // Only real repos and users reach the log, so it cannot be filled with made-up names.
  try {
    await gh(key.startsWith("user:") ? `/users/${key.slice(5)}` : `/repos/${key}`);
  } catch (e) {
    if (e instanceof GithubError && e.status === 404) {
      return NextResponse.json({ ok: false, error: "not found on GitHub" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, status: "skipped" }, { status: 202 });
  }
  const status = await logRequest(key);
  return NextResponse.json({ ok: true, status }, { status: 202 });
}
