import Link from "next/link";
import { readData } from "../../lib/store";

export const metadata = {
  title: "추천 영화 | Syno.",
  description: "취향 분석을 바탕으로 Gemini가 추천한, 아직 보지 않은 영화들",
};

// 취향 분석에서 생성한 추천이 쌓이는 곳. data/taste-recs.json 을 그대로 읽는다.
// 관리자에서 '추천 생성'을 누를 때마다 새 추천이 위에 얹히고, 평가한 영화는 빠진다.
export default function RecommendationsPage() {
  const recs = readData("taste-recs.json", { items: [] });
  const items = recs.items || [];

  return (
    <>
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">추천 영화</h1>
          <p className="mt-1 text-sm text-muted">
            취향 분석으로 고른, 아직 보지 않은 영화{items.length > 0 && ` · ${items.length}편`}
          </p>
        </div>
        <Link href="/watched/taste" className="text-sm text-accent hover:underline">
          취향 분석 →
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-16 text-center text-sm text-muted">
          아직 추천이 없습니다.
          <br />
          관리자 → 영화 관리 → 왓챠피디아 가져오기에서 “추천 생성”을 누르면 여기에 쌓입니다.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((m) => (
            <a
              key={m.tmdbId}
              href={`https://www.themoviedb.org/movie/${m.tmdbId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group"
            >
              <div className="overflow-hidden rounded-lg border border-line bg-surface">
                {m.poster ? (
                  <img
                    src={m.poster}
                    alt={m.title}
                    loading="lazy"
                    className="aspect-[2/3] w-full object-cover transition group-hover:opacity-90"
                  />
                ) : (
                  <div className="flex aspect-[2/3] items-center justify-center p-2 text-center text-xs text-muted">
                    {m.title}
                  </div>
                )}
              </div>
              <p className="mt-1.5 truncate text-xs font-medium group-hover:text-accent">
                {m.title}
                {m.year ? <span className="text-muted"> · {m.year}</span> : null}
              </p>
              {m.why && <p className="mt-0.5 line-clamp-3 text-[11px] leading-snug text-muted/80">{m.why}</p>}
            </a>
          ))}
        </div>
      )}
    </>
  );
}
