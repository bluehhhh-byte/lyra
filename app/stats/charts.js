import Link from "next/link";

// Shared, presentational — no hooks, so both the server stats page and the
// client drill-down can render bars from the same source.
export const pct = (n, total) => (total ? `${Math.round((n / total) * 100)}%` : "—");

// `split`이 있으면 막대가 두 층이 된다 — 같은 어휘를 곡과 영화가 함께 쓰는 것을
// 한 판에서 보여주기 위해서다. 영화 38편은 곡 965곡 옆에서 막대로는 실낱같지만,
// 척도를 부풀리지 않는다(그러면 그림이 거짓말을 한다). 대신 수치 쪽에
// "47곡 · 10편"으로 나눠 적어 정확도는 숫자가 진다.
export function Bars({ data, total, link, split }) {
  const max = Math.max(...data.map(([, n]) => n), 1);
  return (
    <ul className="space-y-2">
      {data.map(([label, n]) => {
        const sub = split?.counts.get(label) || 0;
        const row = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate">{label}</span>
              {/* 퍼센트를 opacity-60으로 눌렀더니 muted 위에 겹쳐 3.33:1이 됐다(AA 4.5:1).
                  위계를 지우지 않으려면 낮추는 대신 올린다 — 수치는 ink, 퍼센트는 muted. */}
              <span className="shrink-0 tabular-nums text-ink">
                {/* 영화가 없는 줄도 단위를 붙인다 — 옆 줄이 "101곡 · 10편"인데
                    여기만 "72"면 그 숫자가 곡인지 합계인지 읽는 사람이 멈춘다. */}
                {split ? (
                  <>
                    {n - sub}
                    <span className="text-muted">{split.primaryUnit}</span>
                    {sub > 0 && (
                      <>
                        <span className="text-muted"> · </span>
                        {sub}
                        <span className="text-muted">{split.secondaryUnit}</span>
                      </>
                    )}{" "}
                  </>
                ) : (
                  <>{n} </>
                )}
                <span className="text-muted">{pct(n, total)}</span>
              </span>
            </div>
            {/* width is the only dynamic bit — inline style beats 100 arbitrary classes */}
            <div className="flex h-1.5 overflow-hidden  bg-line">
              <div className="h-full  bg-accent" style={{ width: `${((n - sub) / max) * 100}%` }} />
              {sub > 0 && (
                <div
                  className="h-full  bg-accent/45 ring-1 ring-inset ring-accent"
                  style={{ width: `${(sub / max) * 100}%` }}
                />
              )}
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
