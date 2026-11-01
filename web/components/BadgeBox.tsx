"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { parseRepoInput } from "@/lib/slug";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://ghostwritten.dev").replace(/\/$/, "");

export function BadgeBox({ initial = "", compact = false }: { initial?: string; compact?: boolean }) {
  const [value, setValue] = useState(initial);
  const [copied, setCopied] = useState(false);
  const [settled, setSettled] = useState(initial);
  // Wait for typing to stop before loading the preview, so keystrokes do not each hit GitHub.
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), 700);
    return () => clearTimeout(t);
  }, [value]);
  const parsed = parseRepoInput(value);
  const preview = parseRepoInput(settled);
  const previewReady = parsed && preview && parsed.owner === preview.owner && parsed.repo === preview.repo;
  const md = parsed
    ? `[![ghostwritten](${SITE}/api/badge/${parsed.owner}/${parsed.repo}.svg)](${SITE}/r/${parsed.owner}/${parsed.repo})`
    : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable: the text is selectable */
    }
  }

  return (
    <div>
      <label htmlFor={compact ? "badge-repo-2" : "badge-repo"} className="block font-bold cond text-lg">
        Repository
      </label>
      <input
        id={compact ? "badge-repo-2" : "badge-repo"}
        className="field"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="owner/repo or a github.com URL"
        autoComplete="off"
        spellCheck={false}
        inputMode="url"
      />
      <div className="mt-3 min-h-[5.5rem]">
        {parsed ? (
          <>
            {previewReady ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/badge/${parsed.owner}/${parsed.repo}.svg`} alt={`ghostwritten badge for ${parsed.owner}/${parsed.repo}`} height={20} className="h-5" />
            ) : (
              <span className="block h-5 text-sm text-muted">Loading badge...</span>
            )}
            <pre className="mt-2 p-3 bg-paper2 text-[12.5px] leading-snug whitespace-pre-wrap break-all select-all">{md}</pre>
            <div className="mt-2 flex flex-wrap gap-3 items-center">
              <button type="button" className="btn" onClick={copy}>{copied ? "Copied" : "Copy markdown"}</button>
              <Link className="link text-sm" href={`/r/${parsed.owner}/${parsed.repo}`}>See the full numbers</Link>
            </div>
          </>
        ) : (
          <p className="text-muted text-sm pt-2">
            {value.trim() ? "Enter the repository as owner/repo." : "Paste a repository to get its badge. The first request reads the last 500 commits from GitHub."}
          </p>
        )}
      </div>
    </div>
  );
}
