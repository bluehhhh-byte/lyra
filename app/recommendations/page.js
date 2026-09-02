import Link from "next/link";
import { readRuntimeData } from "../../lib/store";
import { getAllMoviesMeta } from "../../lib/movies";
import { getRated } from "../../lib/watched";
import MovieRecs from "./movie-recs";

export const metadata = {
  title: "추천 영화 | Cyno.",
  description: "취향 분석을 바탕으로 Gemini가 추천한, 아직 보지 않은 영화들",
};

// 취향 분석에서 생성한 추천이 쌓이는 곳. data/taste-recs.json 을 그대로 읽는다.
// 관리자에서 '추천 생성'을 누를 때마다 새 추천이 위에 얹히고, 평가한 영화는 빠진다.
// 추천 곡은 /recommendations/music — 한 페이지에 합쳤더니 너무 길어 분리.
export default async function RecommendationsPage() {
  const [recs, movies] = await Promise.all([
    readRuntimeData("taste-recs.json", { items: [] }),
    getAllMoviesMeta(),
  ]);
  // 추천 후 평가했거나 등록한 작품은 다음 생성을 기다리지 않고 즉시 숨긴다
  const seen = new Set([
    ...getRated().map((m) => String(m.tmdbId)),
    ...movies.map((m) => String(m.tmdbId)),
  ]);
  const items = (recs.items || []).filter((m) => !seen.has(String(m.tmdbId)));
  const batches = new Map();
  for (const movie of items) {
    const at = movie.at || recs.at || "이전 추천";
    if (!batches.has(at)) batches.set(at, []);
    batches.get(at).push(movie);
  }
  const ordered = [...batches.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  const [latest, ...older] = ordered;
  const extend = latest?.[1].filter((movie) => movie.direction !== "discover") || [];
  const discover = latest?.[1].filter((movie) => movie.direction === "discover") || [];

  return (
    <>
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">추천 영화</h1>
          <p className="mt-1 text-sm text-muted">
            취향 분석으로 고른, 아직 보지 않은 영화{items.length > 0 && ` · ${items.length}편`}
          </p>
        </div>
        <div className="flex gap-4">
          <Link href="/recommendations/music" className="text-sm text-accent hover:underline">
            추천 곡 →
          </Link>
          <Link href="/watched/taste" className="text-sm text-accent hover:underline">
            취향 분석 →
          </Link>
        </div>
      </div>

      {items.length === 0 ? (
        <div className=" border border-dashed border-line px-6 py-16 text-center text-sm text-muted">
          아직 추천이 없습니다.
          <br />
          관리자 → 영화 관리 → 왓챠피디아 가져오기에서 “추천 생성”을 누르면 여기에 쌓입니다.
        </div>
      ) : discover.length > 0 ? (
        <>
          <section className="mb-12">
            <h2 className="mb-1 text-sm font-semibold text-muted">취향의 연장선</h2>
            <p className="mb-4 text-xs text-muted">높은 별점을 준 국가·장르·감독을 더 깊게</p>
            <MovieRecs items={extend} />
          </section>
          <section className="mb-12">
            <h2 className="mb-1 text-sm font-semibold text-muted">새로운 방향</h2>
            <p className="mb-4 text-xs text-muted">연결점은 남기되 덜 본 국가·시대·형식으로</p>
            <MovieRecs items={discover} />
          </section>
        </>
      ) : (
        <MovieRecs items={latest?.[1] || items} />
      )}

      {older.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-3 text-sm font-semibold text-muted">이전 추천</h2>
          <div className="space-y-2">
            {older.map(([at, list]) => (
              <details key={at} className=" border border-line px-4 py-3">
                <summary className="cursor-pointer text-sm text-muted hover:text-accent">{at.slice(0, 10)} · {list.length}편</summary>
                <div className="pt-4"><MovieRecs items={list} /></div>
              </details>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
