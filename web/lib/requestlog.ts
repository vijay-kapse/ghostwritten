import "server-only";
import { ghHeaders, hasToken } from "./github";
import { isOwner, isRepoName } from "./slug";

const LOG_REPO = process.env.GHOSTWRITTEN_REPO || "vijay-kapse/ghostwritten";
const LOG_PATH = "data/requests.log";
const BOT = { name: "ghostwritten-bot", email: "bot@ghostwritten.dev" };

// Per-instance debounce: one write attempt per key per UTC day. Cold starts reset this,
// so the file itself is also checked for the key before appending.
const seen = new Map<string, string>();

export function requestKey(raw: string): string | null {
  const s = raw.trim();
  if (s.startsWith("user:")) {
    const login = s.slice(5);
    return isOwner(login) ? `user:${login.toLowerCase()}` : null;
  }
  const [owner, repo, ...rest] = s.split("/");
  if (!owner || !repo || rest.length || !isOwner(owner) || !isRepoName(repo)) return null;
  return `${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

interface ContentsResponse {
  sha: string;
  content: string;
}

async function getFile(): Promise<{ text: string; sha?: string }> {
  const res = await fetch(`https://api.github.com/repos/${LOG_REPO}/contents/${LOG_PATH}?ref=main`, {
    headers: ghHeaders(),
    cache: "no-store",
  });
  if (res.status === 404) return { text: "" };
  if (!res.ok) throw new Error(`contents GET ${res.status}`);
  const j = (await res.json()) as ContentsResponse;
  return { text: Buffer.from(j.content, "base64").toString("utf8"), sha: j.sha };
}

async function putFile(text: string, sha: string | undefined): Promise<number> {
  const res = await fetch(`https://api.github.com/repos/${LOG_REPO}/contents/${LOG_PATH}`, {
    method: "PUT",
    headers: ghHeaders({ "Content-Type": "application/json" }),
    cache: "no-store",
    body: JSON.stringify({
      message: "[skip ci] request",
      content: Buffer.from(text, "utf8").toString("base64"),
      branch: "main",
      ...(sha ? { sha } : {}),
      committer: BOT,
      author: BOT,
    }),
  });
  return res.status;
}

export type LogResult = "logged" | "duplicate" | "skipped" | "failed";

/** Appends `key` to data/requests.log on GitHub. Never throws; absent token means skipped. */
export async function logRequest(rawKey: string): Promise<LogResult> {
  const key = requestKey(rawKey);
  if (!key || !hasToken()) return "skipped";
  const today = new Date().toISOString().slice(0, 10);
  if (seen.get(key) === today) return "duplicate";
  seen.set(key, today);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { text, sha } = await getFile();
      if (text.split("\n").some((l) => l.trim().toLowerCase() === key)) return "duplicate";
      const next = (text && !text.endsWith("\n") ? text + "\n" : text) + key + "\n";
      const status = await putFile(next, sha);
      if (status === 200 || status === 201) return "logged";
      if (status !== 409 && status !== 422) break; // stale sha: retry once, anything else: give up
    }
  } catch {
    // fail silently
  }
  seen.delete(key);
  return "failed";
}
