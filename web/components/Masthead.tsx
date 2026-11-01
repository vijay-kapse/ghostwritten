import Link from "next/link";
import { dateLabel, windowLabel } from "@/lib/format";
import { loadSummary } from "@/lib/data";

export function Masthead() {
  const { data, provenance } = loadSummary();
  return (
    <header className="w-full">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-4">
        <div className="flex items-end justify-between gap-4 border-b-[3px] border-ink pb-2">
          <Link href="/" className="display text-[2.1rem] sm:text-[2.6rem] no-underline" aria-label="ghostwritten, home">
            ghostwritten
          </Link>
          <nav className="flex gap-4 sm:gap-6 text-[15px] font-semibold pb-1" aria-label="Main">
            <Link href="/leaderboard" className="link">Leaderboard</Link>
            <Link href="/methodology" className="link">Methodology</Link>
            <a href="https://github.com/vijay-kapse/ghostwritten" className="link hidden sm:inline">GitHub</a>
          </nav>
        </div>
        <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 py-1.5 text-[12.5px] text-muted border-b border-rule">
          <span>{data?.window ? `Window: ${windowLabel(data.window)}` : "Window: not yet scanned"}</span>
          <span>{data?.generated_at ? `Updated ${dateLabel(data.generated_at)}` : ""}</span>
        </div>
        {provenance === "sample" && (
          <p
            role="note"
            className="my-3 px-3 py-2 text-[13.5px] border-l-[6px] border-accent bg-paper2"
          >
            <strong>Sample data.</strong> The scanner has not produced <code>data/</code> in this build, so every
            repository and number below is invented to show the layout.
          </p>
        )}
      </div>
    </header>
  );
}
