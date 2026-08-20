// 검색 인덱스 — 헤더 통합 검색(/api/search)과 홈 가사 검색(/api/search/lyrics)이
// 같은 인덱스를 쓴다. 각 라우트가 따로 만들면 인스턴스마다 전체 콘텐츠를 두 번
// 읽고, 한쪽만 고쳐지는 사고가 난다.
import { getAllSongsRuntime } from "./songs.js";
import { getAllMoviesRuntime } from "./movies.js";
import { getWatchedRuntime } from "./watched.js";
import { getAllPeopleRuntime } from "./people.js";
import { getAllMomentsRuntime } from "./moments.js";
import { contentRevision } from "./content-db.js";

const lower = (...values) => values.flat().filter(Boolean).join(" ").toLowerCase();

async function build() {
  const [songs, movies, watched, people, moments] = await Promise.all([
    getAllSongsRuntime(),
    getAllMoviesRuntime(),
    getWatchedRuntime(),
    getAllPeopleRuntime(),
    getAllMomentsRuntime(),
  ]);
  return {
    songs: songs.map((song) => {
      const lines = song.stanzas.flatMap((stanza) => stanza.lines.flatMap((line) => [line.en, line.ko])).filter(Boolean);
      return {
        slug: song.slug,
        href: `/songs/${song.slug}`,
        title: song.title,
        subtitle: song.artist,
        image: song.artwork,
        meta: lower(song.title, song.artist, song.tags, song.keywords, lines),
        lines,
      };
    }),
    movies: movies.map((movie) => ({
      href: `/movies/${movie.slug}`,
      title: movie.title_ko || movie.title,
      subtitle: movie.director_ko || movie.director || movie.year,
      image: movie.poster,
      meta: lower(movie.title, movie.title_ko, movie.director, movie.director_ko, movie.cast, movie.tags, movie.themes),
    })),
    watched: watched.map((movie) => ({
      href: movie.tmdbId ? `https://www.themoviedb.org/${movie.media === "tv" ? "tv" : "movie"}/${movie.tmdbId}` : "",
      title: movie.title_ko || movie.title,
      subtitle: movie.director_ko || movie.director || movie.year,
      image: movie.poster,
      meta: lower(movie.title, movie.title_ko, movie.director, movie.director_ko, movie.cast, movie.genre, movie.country),
    })),
    people: people.map((person) => ({
      href: `/people/${encodeURIComponent(person.name)}`,
      title: person.name,
      subtitle: `${person.works.length}편`,
      image: person.works.find((work) => work.poster)?.poster || "",
      meta: lower(person.name, person.works.map((work) => [work.title, work.title_ko])),
    })),
    moments: moments.map((moment) => ({
      href: `/moments/${moment.slug}`,
      title: moment.title,
      subtitle: moment.startDate,
      image: "",
      meta: lower(moment.title, moment.body, moment.emotions, moment.keywords),
    })),
  };
}

let INDEX = null;
let revisionCheckedAt = 0;
// revision 확인을 60초 캐시한다 — 타이핑마다 Neon에 revision 쿼리가 나가면 안 된다.
// 검색 인덱스가 최대 60초 늦는 것은 개인 아카이브에서 아무 문제가 아니다.
const REVISION_TTL_MS = 60_000;

export async function currentSearchIndex() {
  if (INDEX && Date.now() - revisionCheckedAt < REVISION_TTL_MS) return INDEX.value;
  const revision = await contentRevision();
  revisionCheckedAt = Date.now();
  if (!INDEX || INDEX.revision !== revision) INDEX = { revision, value: await build() };
  return INDEX.value;
}
