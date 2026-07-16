import Link from "next/link";

// Shared, presentational — no hooks, so both the server stats page and the
// client drill-down can render bars from the same source.
export const pct = (n, total) => (total ? `${Math.round((n / total) * 100)}%` : "—");

export function Bars({ data, total, link }) {
  const max = Math.max(...data.map(([, n]) => n), 1);
  return (
    <ul className="space-y-2">
      {data.map(([label, n]) => {
        const row = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate">{label}</span>
              <span className="shrink-0 tabular-nums text-muted">
                {n} <span className="opacity-60">{pct(n, total)}</span>
              </span>
            </div>
            {/* width is the only dynamic bit — inline style beats 100 arbitrary classes */}
            <div className="h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-accent" style={{ width: `${(n / max) * 100}%` }} />
            </div>
          </>
        );
        return (
          <li key={label}>
            {link ? (
              <Link href={link(label)} className="block hover:opacity-80">
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}
