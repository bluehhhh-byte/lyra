import { getAllSongsRuntime } from "../lib/songs";
import { getAllMoviesRuntime } from "../lib/movies";
import { parseEmotion } from "../lib/keywords";
import { buildHomeInsights } from "../lib/home-insights";
import Browse from "./browse";
import HomeIntro from "./home-intro";

const COUNTRY = { ko: "한국", ja: "일본", en: "영미" };
const COUNTRY_TAGS = ["한국", "일본", "영미", "유럽", "아시아", "중남미", "중동", "기타"];
// the country tag tracks the artist's nationality; lyric language is only a
// fallback for songs saved before country tags existed
const countryOf = (s) => s.tags.find((t) => COUNTRY_TAGS.includes(t)) || COUNTRY[s.lang] || "기타";

export default async function Home({ searchParams }) {
  const { tag, q, group, emotion, decade } = (await searchParams) || {};
  const [allSongs, allMovies] = await Promise.all([getAllSongsRuntime(), getAllMoviesRuntime()]);
  const hasDiscoveryState = Boolean(tag || q || emotion || decade || (group && group !== "none"));
  const insights = hasDiscoveryState ? null : buildHomeInsights(allSongs, allMovies);
  const songs = allSongs.map((s) => ({
    slug: s.slug,
    title: s.title,
    title_ko: s.title_ko || "",
    artist: s.artist,
    artist_ko: s.artist_ko || "",
    year: s.year || "",
    artwork: s.artwork,
    tags: s.tags,
    emotion: parseEmotion(s.emotion),
    country: countryOf(s),
    decade: s.year ? `${Math.floor(+s.year / 10) * 10}s` : "미상",
    album: s.album || "",
    // 검색용 소문자 문자열(metaSearch)은 서버에서 만들어 보내지 않는다 — 위 필드들의
    // 사본이라 919곡 × 두 번(HTML + RSC 페이로드) 실려 초기 응답만 키웠다.
    // browse.js가 클라이언트에서 같은 재료로 만든다. 가사는 /api/lyrics-index에서
    // 첫 검색 때만 온다.
  }));

  return <>
    {insights && <HomeIntro insights={insights} />}
    <section aria-labelledby="music-collection-title">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <div>
          <h2 id="music-collection-title" className="text-lg font-bold">음악 컬렉션</h2>
          {!hasDiscoveryState && <p className="mt-1 text-xs text-muted">분석의 끝은 언제나 기록으로 돌아옵니다.</p>}
        </div>
      </div>
      <Browse
        songs={songs}
        initialTag={tag || ""}
        initialQ={q || ""}
        initialGroup={group || "none"}
        initialEmotion={parseEmotion(emotion)}
        initialDecade={/^\d{4}s$/.test(decade || "") ? decade : ""}
      />
    </section>
  </>;
}
