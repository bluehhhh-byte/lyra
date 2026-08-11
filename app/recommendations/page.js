import Link from "next/link";
import { readData } from "../../lib/store";
import { tmdbUrl } from "../../lib/tmdb-link";
import CoverImage from "../cover-image";
import SongRecs from "./song-recs";

export const metadata = {
  title: "추천 | Lyra",
  description: "취향 분석을 바탕으로 Gemini가 추천한, 아직 안 들은 곡과 안 본 영화들",
};

// 취향 분석에서 생성한 추천이 쌓이는 곳 — 곡(data/song-recs.json)과
// 영화(data/taste-recs.json). 관리자에서 '추천 생성'을 누를 때마다 새 추천이
// 위에 얹히고, 그새 담은 곡·평가한 영화는 빠진다.
export default function RecommendationsPage() {
  const songRecs = readData("song-recs.json", { items: [] });
  const songs = songRecs.items || [];
  const movieRecs = readData("taste-recs.json", { items: [] });
  const movies = movieRecs.items || [];

  return (
    <>
      <div className="mb-10">
        <h1 className="text-2xl font-bold">추천</h1>
        <p className="mt-1 text-sm text-muted">컬렉션 취향으로 고른, 아직 안 들은 곡과 안 본 영화</p>
      </div>

      <section className="mb-14">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-muted">
            추천 곡{songs.length > 0 && ` · ${songs.length}곡`}
          </h2>
          <Link href="/stats" className="text-sm text-accent hover:underline">
            음악 통계 →
          </Link>
        </div>
        {songs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center text-sm text-muted">
            아직 추천 곡이 없습니다.
            <br />
            관리자 → 등록된 곡에서 “추천 곡 생성”을 누르면 여기에 쌓입니다.
          </div>
        ) : (
          <SongRecs items={songs} />
        )}
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-muted">
            추천 영화{movies.length > 0 && ` · ${movies.length}편`}
          </h2>
          <Link href="/watched/taste" className="text-sm text-accent hover:underline">
            취향 분석 →
          </Link>
        </div>
        {movies.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center text-sm text-muted">
            아직 추천이 없습니다.
            <br />
            관리자 → 영화 관리에서 “추천 생성”을 누르면 여기에 쌓입니다.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {movies.map((m) => (
              <a
                key={m.tmdbId}
                href={tmdbUrl(m.tmdbId, m.media)}
                target="_blank"
                rel="noopener noreferrer"
                className="group"
              >
                <div className="overflow-hidden rounded-lg border border-line bg-surface">
                  <CoverImage
                    src={m.poster}
                    alt={m.title}
                    label={m.title}
                    loading="lazy"
                    className="aspect-[2/3] w-full object-cover transition group-hover:opacity-90"
                  />
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
      </section>
    </>
  );
}
