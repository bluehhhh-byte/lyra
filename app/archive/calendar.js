import Link from "next/link";

// 연·월 미니 캘린더 — 선택 연도의 12개월 그리드. 기록이 있는 달만 링크,
// 없는 달은 비활성. 상태는 전부 ?month= URL에 있다(새로고침·공유·뒤로 가기 안전).
export default function ArchiveCalendar({ stats, years, month, monthHref }) {
  const year = month.slice(0, 4);
  const yearIndex = years.indexOf(year);
  const byMonth = new Map(stats.map((s) => [s.month, s]));
  const grid = Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, "0")}`;
    return { month: m, num: i + 1, stat: byMonth.get(m) };
  });
  // 연도 이동은 그 해의 마지막 기록 달로 간다 — 캘린더에 별도 상태를 두지 않는다
  const yearTarget = (y) => stats.filter((s) => s.month.startsWith(`${y}-`)).at(-1)?.month;
  const prevYear = yearIndex > 0 ? years[yearIndex - 1] : null;
  const nextYear = yearIndex >= 0 && yearIndex < years.length - 1 ? years[yearIndex + 1] : null;

  return (
    <nav aria-label="기록 연도와 월 탐색" className="mb-8 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        {prevYear ? (
          <Link href={monthHref(yearTarget(prevYear))} className="rounded px-2 py-1 text-sm text-muted hover:text-accent" aria-label={`${prevYear}년으로 이동`}>
            ← {prevYear}
          </Link>
        ) : <span className="px-2 py-1 text-sm text-line" aria-hidden>←</span>}
        <span className="text-base font-semibold" aria-current="true">{year}년</span>
        {nextYear ? (
          <Link href={monthHref(yearTarget(nextYear))} className="rounded px-2 py-1 text-sm text-muted hover:text-accent" aria-label={`${nextYear}년으로 이동`}>
            {nextYear} →
          </Link>
        ) : <span className="px-2 py-1 text-sm text-line" aria-hidden>→</span>}
      </div>
      <ol className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-12">
        {grid.map(({ month: m, num, stat }) => {
          const active = m === month;
          return (
            <li key={m}>
              {stat ? (
                <Link
                  href={monthHref(m)}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center rounded-lg border px-1 py-2 text-sm transition ${
                    active
                      ? "border-accent bg-accent/10 font-semibold text-accent"
                      : "border-line hover:border-accent/60 hover:text-accent"
                  }`}
                >
                  <span>{num}월</span>
                  <span className={`mt-0.5 text-[10px] ${active ? "text-accent" : "text-muted"}`}>
                    {stat.songs + stat.movies}개
                  </span>
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="flex min-h-14 flex-col items-center justify-center rounded-lg border border-dashed border-line/60 px-1 py-2 text-sm text-line"
                >
                  <span>{num}월</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
