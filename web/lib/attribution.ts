/**
 * TypeScript port of scanner/signatures.py, driven by the same data (scanner/signatures.json).
 * The engine mirrors `match_rules`, `is_automation` and `classify` one for one, so the regexes
 * are not re-typed here and cannot drift from the scanner. tests/parity.test.ts checks it
 * against the Python implementation's output.
 *
 * A commit is "ai" when any rule matches. Merge and automation commits leave both sides of the fraction.
 */
import generated from "./signatures.generated.json";

export interface SignatureRule {
  id: string;
  tool: string;
  description?: string;
  trailer?: string[];
  body?: string[];
  subject?: string[];
  names?: string[];
  logins?: string[];
}

export interface SignaturesFile {
  schema: number;
  version: string;
  flags: string;
  trailer_line: string;
  order: string[];
  notes: string[];
  automation: string[];
  unlisted_bot_is_automation: boolean;
  agent_bots: Record<string, string>;
  rules: SignatureRule[];
}

export interface FlatCommit {
  /** Full commit message (subject + body + trailers). */
  message: string;
  author_login?: string | null;
  author_name?: string | null;
  committer_login?: string | null;
  committer_name?: string | null;
  /** Number of parents. 2 or more is a merge. */
  parents?: number;
}

/** The shape of one item from GET /repos/{o}/{r}/commits. */
export interface ApiCommitLike {
  parents?: unknown[] | null;
  author?: { login?: string | null } | null;
  committer?: { login?: string | null } | null;
  commit?: {
    message?: string | null;
    author?: { name?: string | null } | null;
    committer?: { name?: string | null } | null;
  } | null;
}

export type CommitKind = "merge" | "automation" | "ai" | "human";
export interface Classification {
  kind: CommitKind;
  /** Rule ids that matched. Non-empty only when kind is "ai". */
  rules: string[];
}

export function fromApiCommit(c: ApiCommitLike): FlatCommit {
  return {
    message: c.commit?.message ?? "",
    author_login: c.author?.login ?? null,
    author_name: c.commit?.author?.name ?? null,
    committer_login: c.committer?.login ?? null,
    committer_name: c.commit?.committer?.name ?? null,
    parents: c.parents?.length ?? 0,
  };
}

interface CompiledRule {
  id: string;
  tool: string;
  trailer: RegExp[];
  body: RegExp[];
  subject: RegExp[];
  names: RegExp[];
  logins: Set<string>;
}

export interface Engine {
  signatures: SignaturesFile;
  rules: CompiledRule[];
  trailerLine: RegExp;
  automation: Set<string>;
  agentBots: Set<string>;
  matchRules(c: FlatCommit): string[];
  isAutomation(login?: string | null, name?: string | null): boolean;
  classify(c: FlatCommit): Classification;
  toolForRule(id: string): string;
}

export function createEngine(sig: SignaturesFile): Engine {
  const flags = sig.flags.replace(/[^gimsuy]/g, "");
  const re = (p: string) => new RegExp(p, flags);
  const lower = (xs: string[] | undefined) => new Set((xs ?? []).map((s) => s.toLowerCase()));
  const rules: CompiledRule[] = sig.rules.map((r) => ({
    id: r.id,
    tool: r.tool,
    trailer: (r.trailer ?? []).map(re),
    body: (r.body ?? []).map(re),
    subject: (r.subject ?? []).map(re),
    names: (r.names ?? []).map(re),
    logins: lower(r.logins),
  }));
  const trailerLine = new RegExp(sig.trailer_line, flags.includes("g") ? flags : flags + "g");
  const automation = lower(sig.automation);
  const agentBots = lower(Object.keys(sig.agent_bots));

  const matchRules = (c: FlatCommit): string[] => {
    const message = c.message ?? "";
    const subject = message.split("\n", 1)[0];
    const trailers = [...message.matchAll(trailerLine)].map((m) => m[1].trim());
    const logins = [c.author_login, c.committer_login].filter((x): x is string => !!x);
    const names = [c.author_name, c.committer_name].filter((x): x is string => !!x);
    const ids = new Set([...logins, ...names].map((x) => x.toLowerCase()));
    return rules
      .filter(
        (r) =>
          r.trailer.some((p) => trailers.some((t) => p.test(t))) ||
          r.body.some((p) => p.test(message)) ||
          r.subject.some((p) => p.test(subject)) ||
          r.names.some((p) => names.some((n) => p.test(n))) ||
          [...r.logins].some((l) => ids.has(l)),
      )
      .map((r) => r.id);
  };

  const isAutomation = (login?: string | null, name?: string | null): boolean => {
    for (const v of [login, name]) {
      if (v && automation.has(v.toLowerCase())) return true;
    }
    if (sig.unlisted_bot_is_automation && login) {
      const lg = login.toLowerCase();
      if (lg.endsWith("[bot]") && !agentBots.has(lg)) return true;
    }
    return false;
  };

  const classify = (c: FlatCommit): Classification => {
    if ((c.parents ?? 0) >= 2) return { kind: "merge", rules: [] };
    const rulesHit = matchRules(c);
    if (isAutomation(c.author_login, c.author_name)) return { kind: "automation", rules: [] };
    if (rulesHit.length) return { kind: "ai", rules: rulesHit };
    return { kind: "human", rules: [] };
  };

  return {
    signatures: sig,
    rules,
    trailerLine,
    automation,
    agentBots,
    matchRules,
    isAutomation,
    classify,
    toolForRule: (id) => rules.find((r) => r.id === id)?.tool ?? id,
  };
}

/** Where the rules in this build came from: the real scanner file, or the labelled fixture copy. */
export const SIGNATURES_SOURCE = (generated as { source: "scanner" | "fixture" }).source;

export const engine = createEngine((generated as unknown as { signatures: SignaturesFile }).signatures);
export const classify = engine.classify;
export const matchRules = engine.matchRules;
export const toolForRule = engine.toolForRule;
