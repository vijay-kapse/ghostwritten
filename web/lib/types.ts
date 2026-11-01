// Mirrors SCHEMA.md at the repo root. Change SCHEMA.md first.

export interface MonthStats {
  total: number;
  ai: number;
  automation: number;
  merges: number;
  by_rule: Record<string, number>;
}

export interface RepoData {
  schema: number;
  repo: string;
  org: string;
  language: string | null;
  stars: number | null;
  default_branch: string;
  scanned_at: string;
  window_start: string;
  complete: boolean;
  months: Record<string, MonthStats>;
  /** Set only when the numbers were computed live by the web, not read from data/. */
  live?: { commits: number; capped: boolean };
}

export interface RepoRow {
  repo: string;
  ai_share: number;
  ai: number;
  total: number;
  stars: number;
  language: string | null;
}
export interface OrgRow {
  org: string;
  ai_share: number;
  ai: number;
  total: number;
  repos: number;
}
export interface LanguageRow {
  language: string;
  ai_share: number;
  ai: number;
  total: number;
  repos: number;
}
export interface ToolRow {
  rule: string;
  ai: number;
}
export interface TrendRow {
  month: string;
  ai: number;
  total: number;
  ai_share: number;
}

export interface Leaderboards {
  schema: number;
  generated_at: string;
  universe: { repos: number; selection: string };
  window: string;
  repos: RepoRow[];
  orgs: OrgRow[];
  languages: LanguageRow[];
  tools: ToolRow[];
  trend: TrendRow[];
}

/** SCHEMA.md leaves summary.json keys unspecified; these are read leniently. */
export interface Summary {
  generated_at: string;
  window: string;
  universe_repos: number | null;
  ai: number | null;
  total: number | null;
  ai_share: number;
  median_repo_ai_share: number | null;
  repos_with_any_ai: number | null;
  mom_change: number | null;
}

export type Provenance = "data" | "sample";
