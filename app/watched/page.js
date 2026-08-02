import Link from "next/link";
import { getWatched } from "../../lib/watched";
import WatchedGrid from "./grid";

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
        <WatchedGrid rated={rated} />
      )}
    </>
  );
}
