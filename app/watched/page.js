import Link from "next/link";
import { getWatched } from "../../lib/watched";

export const metadata = {
  title: "평가한 영화 | Syno.",
  description: "왓챠에서 별점 매긴 영화 목록",
};

// 왓챠 별점 목록의 그리드 버전. 별점 높은 순 → 최신 개봉 순.
// 개별 페이지가 없는 영화라 카드는 링크가 아니라(감상 42편만 곡·영화 페이지로).
export default function WatchedPage() {
  const all = getWatched();
  const rated = all.filter((m) => m.rating != null);
  const noRating = all.length - rated.length;

  rated.sort(
    (a, b) => b.rating - a.rating || String(b.year).localeCompare(String(a.year))
  );

  const dist = new Map();
  for (const m of rated) dist.set(m.rating, (dist.get(m.rating) || 0) + 1);
  const mean = rated.length
    ? (rated.reduce((n, m) => n + m.rating, 0) / rated.length).toFixed(2)
    : null;

  return (
    <>
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">평가한 영화</h1>
          <p className="mt-1 text-sm text-muted">
            {all.length}편 기록
            {rated.length > 0 && ` · ${rated.length}편 평가 · 평균 ★${mean}`}
          </p>
        </div>
        <Link href="/watched/taste" className="text-sm text-accent hover:underline">
          취향 분석 →
        </Link>
      </div>

      {rated.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-16 text-center text-sm text-muted">
          아직 별점이 비어 있습니다.
          <br />
          관리자 → 영화 관리 → 왓챠피디아 가져오기에서 별점을 채우면 목록이 나옵니다.
          {noRating > 0 && <p className="mt-2 text-xs text-muted/60">메타데이터는 {all.length}편 준비됨</p>}
        </div>
      ) : (
        <>
          {/* 별점 분포 — 5.0에서 0.5까지 */}
          <div className="mb-10 flex items-end gap-1.5">
            {Array.from({ length: 10 }, (_, i) => (5 - i * 0.5).toFixed(1)).map((s) => {
              const n = dist.get(Number(s)) || 0;
              const max = Math.max(...dist.values(), 1);
              return (
                <div key={s} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] tabular-nums text-muted">{n || ""}</span>
                  <div
                    className="w-full rounded-t bg-accent/80"
                    style={{ height: `${Math.max(2, (n / max) * 80)}px` }}
                  />
                  <span className="text-[10px] tabular-nums text-muted">{s}</span>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-3 gap-x-4 gap-y-8 sm:grid-cols-4 lg:grid-cols-6">
            {rated.map((m) => (
              <div key={m.code} className="group">
                <div className="relative overflow-hidden rounded-lg border border-line bg-surface">
                  {m.poster ? (
                    <img
                      src={m.poster}
                      alt={m.title_ko || m.title}
                      loading="lazy"
                      className="aspect-[2/3] w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[2/3] items-center justify-center text-xs text-muted">
                      {m.title_ko || m.title}
                    </div>
                  )}
                  <span className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-white tabular-nums">
                    ★{m.rating}
                  </span>
                </div>
                <p className="mt-1.5 truncate text-xs font-medium">{m.title_ko || m.title}</p>
                <p className="truncate text-[11px] text-muted">
                  {[m.country, m.year].filter(Boolean).join(" · ")}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
