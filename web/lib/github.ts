import "server-only";

export class GithubError extends Error {
  constructor(
    public status: number,
    message: string,
    public rateLimited = false,
  ) {
    super(message);
    this.name = "GithubError";
  }
}

export const hasToken = () => Boolean(process.env.GITHUB_TOKEN);

export function ghHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "ghostwritten-web",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

/** GET a GitHub REST path. Responses are cached for 24 h by the Next data cache. */
export async function gh<T>(path: string, revalidate = 86400): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: ghHeaders(),
    next: { revalidate },
  });
  if (res.ok) return (await res.json()) as T;
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (remaining === "0" || res.status === 429) {
      throw new GithubError(429, "GitHub rate limit reached. Try again in a few minutes.", true);
    }
  }
  if (res.status === 404) throw new GithubError(404, "Not found on GitHub.");
  if (res.status === 409) throw new GithubError(409, "Repository is empty.");
  throw new GithubError(res.status, `GitHub returned ${res.status}.`);
}

export interface ApiCommit {
  sha: string;
  commit: {
    message: string;
    author: { name?: string; email?: string; date?: string } | null;
    committer: { name?: string; email?: string; date?: string } | null;
  };
  author: { login: string } | null;
  committer: { login: string } | null;
  parents: unknown[];
}

export interface ApiRepo {
  full_name: string;
  name: string;
  fork: boolean;
  language: string | null;
  stargazers_count: number;
  default_branch: string;
  pushed_at: string | null;
  owner: { login: string };
  archived?: boolean;
}
