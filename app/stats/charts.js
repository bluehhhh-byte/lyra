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
              {/* 퍼센트를 opacity-60으로 눌렀더니 muted 위에 겹쳐 3.33:1이 됐다(AA 4.5:1).
                  위계를 지우지 않으려면 낮추는 대신 올린다 — 수치는 ink, 퍼센트는 muted. */}
              <span className="shrink-0 tabular-nums text-ink">
                {n} <span className="text-muted">{pct(n, total)}</span>
              </span>
            </div>
            {/* width is the only dynamic bit — inline style beats 100 arbitrary classes */}
            <div className="h-1.5 overflow-hidden  bg-line">
              <div className="h-full  bg-accent" style={{ width: `${(n / max) * 100}%` }} />
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
