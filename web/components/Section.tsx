export function Section({
  title,
  note,
  id,
  children,
  className = "",
}: {
  title: string;
  note?: React.ReactNode;
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`mt-14 ${className}`} aria-labelledby={id ? `${id}-h` : undefined}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 border-t-2 border-ink pt-2 pb-3">
        <h2 id={id ? `${id}-h` : undefined} className="display cond text-[1.9rem] sm:text-[2.2rem]" style={{ lineHeight: 1 }}>
          {title}
        </h2>
        {note && <p className="text-[13px] text-muted max-w-[52ch]">{note}</p>}
      </div>
      {children}
    </section>
  );
}
