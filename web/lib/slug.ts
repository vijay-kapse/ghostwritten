const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

export function isOwner(s: string): boolean {
  return OWNER.test(s);
}
export function isRepoName(s: string): boolean {
  return REPO.test(s) && s !== "." && s !== "..";
}

/** Accepts "owner/repo", "github.com/owner/repo", or a full URL (with .git or trailing paths). */
export function parseRepoInput(raw: string): { owner: string; repo: string } | null {
  let s = raw.trim();
  s = s.replace(/^https?:\/\//i, "").replace(/^(www\.)?github\.com\//i, "");
  const parts = s.split(/[/?#]/).filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  if (!isOwner(owner) || !isRepoName(repo)) return null;
  return { owner, repo };
}

/** Accepts "login", "@login", or a github.com profile URL. */
export function parseLoginInput(raw: string): string | null {
  let s = raw.trim().replace(/^https?:\/\//i, "").replace(/^(www\.)?github\.com\//i, "").replace(/^@/, "");
  s = s.split(/[/?#]/)[0] ?? "";
  return isOwner(s) ? s : null;
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://ghostwritten.dev").replace(/\/$/, "");
}

export function badgeUrl(owner: string, repo: string): string {
  return `${siteUrl()}/api/badge/${owner}/${repo}.svg`;
}

export function badgeMarkdown(owner: string, repo: string): string {
  return `[![ghostwritten](${badgeUrl(owner, repo)})](${siteUrl()}/r/${owner}/${repo})`;
}
