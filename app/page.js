import { Suspense } from "react";
import { getAllSongsMeta, getSongRuntime } from "../lib/songs";
import { getAllMoviesMeta } from "../lib/movies";
import { buildHomeInsights } from "../lib/home-insights";
import { toHomeSong } from "../lib/home-song-list";
import Browse from "./browse";
import HomeIntro from "./home-intro";
import { tagSuggestions } from "../lib/keywords";
import Link from "next/link";
import { kstDay } from "../lib/kst";
import { anniversaryRecords, latestRecordedDay } from "../lib/latest-day";

export const revalidate = 21600;
const INITIAL_SONGS = 72;

export default async function Home() {
  const [songMetas, allMovies] = await Promise.all([
    getAllSongsMeta(),
    getAllMoviesMeta(),
  ]);
  // 목록은 가사를 제외한 가벼운 메타를 쓰되, 오늘의 기록에 필요한 최신 날짜 곡만
  // 상세 조회한다. 전곡 가사를 홈에 싣지 않으면서도 리포트는 실제 가사를 참고한다.
  const latestDay = latestRecordedDay(songMetas, allMovies);
  const latestSongs = latestDay
    ? await Promise.all(
        songMetas
          .filter((song) => kstDay(song.published || song.date) === latestDay)
          .map((song) => song.stanzas?.length ? song : getSongRuntime(song.slug))
      )
    : [];
  const latestBySlug = new Map(latestSongs.filter(Boolean).map((song) => [song.slug, song]));
  const allSongs = songMetas.map((song) => latestBySlug.get(song.slug) || song);
  const insights = buildHomeInsights(allSongs, allMovies);
  // 초기 HTML/RSC에는 실제로 그리는 카드만 싣는다. 전체 메타는 검색·그룹화·더 보기
  // 같은 상호작용이 시작될 때 캐시된 API에서 한 번 가져온다.
  const songs = allSongs.slice(0, INITIAL_SONGS).map(toHomeSong);
  const tags = tagSuggestions(allSongs);

  // 재발견 — 해가 다른 같은 날짜의 기록. 제목에 "오늘"이 아니라 날짜를 박는다:
  // ISR 6시간 동안 "오늘"은 자정을 넘기면 거짓이 되지만 날짜는 언제나 참이다.
  const renderedDay = kstDay(new Date().toISOString());
  const pastToday = anniversaryRecords(songMetas, allMovies, renderedDay);
  const pastTodayLabel = `${Number(renderedDay.slice(5, 7))}월 ${Number(renderedDay.slice(8, 10))}일`;

  return <>
    <HomeIntro insights={insights} />
    {pastToday.length > 0 && (
      <section aria-labelledby="past-today-title" className="mb-14">
        <h2 id="past-today-title" className="text-lg font-bold">{pastTodayLabel}의 과거 기록</h2>
        <p className="mt-1 text-xs text-muted">해가 다른 같은 날짜에 남긴 기록.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {pastToday.map((record) => (
            <Link
              key={`${record.type}-${record.slug}`}
              href={`/${record.type === "song" ? "songs" : "movies"}/${record.slug}`}
              className="spot group flex items-center gap-3 border border-line bg-surface px-4 py-3"
            >
              <span className="shrink-0 text-sm font-bold tabular-nums text-accent">{record.year}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium group-hover:text-accent">{record.title}</span>
                <span className="block truncate text-xs text-muted">{record.subtitle}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    )}
    <section aria-labelledby="music-collection-title">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <div>
          <h2 id="music-collection-title" className="text-lg font-bold">음악 컬렉션</h2>
          <p className="mt-1 text-xs text-muted">분석의 끝은 언제나 기록으로 돌아옵니다.</p>
        </div>
      </div>
      <Suspense fallback={<p className="py-20 text-center text-sm text-muted">음악 컬렉션을 불러오는 중…</p>}>
        <Browse songs={songs} totalSongs={allSongs.length} availableTags={tags} />
      </Suspense>
    </section>
  </>;
}
