"use client";

export function ErrorPanel({ title, reset, children }: { title: string; reset?: () => void; children?: React.ReactNode }) {
  return (
    <div className="pt-12 max-w-[60ch]" role="alert">
      <div className="border-l-[6px] border-accent pl-4">
        <p className="display cond text-[2rem]" style={{ lineHeight: 1.05 }}>{title}</p>
        <div className="prose mt-2">{children}</div>
        {reset && (
          <button type="button" className="btn mt-4" onClick={reset}>Try again</button>
        )}
      </div>
    </div>
  );
}
