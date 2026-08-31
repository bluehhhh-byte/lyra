import { Suspense } from "react";
import { getAllSongsMeta, getSongRuntime } from "../lib/songs";
import { getAllMoviesMeta } from "../lib/movies";
import { buildHomeInsights } from "../lib/home-insights";
import { toHomeSong } from "../lib/home-song-list";
import Browse from "./browse";
import HomeIntro from "./home-intro";
import { tagSuggestions } from "../lib/keywords";
import { kstDay } from "../lib/kst";
import { latestRecordedDay } from "../lib/latest-day";

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

  return <>
    <HomeIntro insights={insights} />
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
