import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-20 border-t-[3px] border-ink">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row sm:items-baseline justify-between gap-3">
        <p className="font-bold cond text-lg">Signed-only counts. Every number is a floor.</p>
        <nav className="flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Footer">
          <Link href="/methodology" className="link">Methodology</Link>
          <a className="link" href="https://github.com/vijay-kapse/ghostwritten/tree/main/data">Data on GitHub</a>
          <a className="link" href="https://github.com/vijay-kapse/ghostwritten">Source repo</a>
        </nav>
      </div>
    </footer>
  );
}
