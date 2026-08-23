import { unstable_cache } from "next/cache.js";
import { getAllMovies, getAllMoviesMeta } from "./movies.js";
import { getWatched, getWatchedRuntime } from "./watched.js";
import { tmdbUrl } from "./tmdb-link.js";
import { databaseContentEnabled } from "./content-db.js";

// 콘텐츠 캐시와 같은 6시간. 무효화는 태그가 하고, 시한은 그물이다.
// 짧게 줄이면 그만큼 재집계가 늘어난다 — 2026-08 Neon 사고와 같은 실수를 반복하지 말 것.
const PEOPLE_TTL_SECONDS = 6 * 60 * 60;

// 배우 필드: .md는 "A, B, C" 문자열, 데이터셋은 ["A","B"] 배열 — 둘 다 받는다.
export const splitCast = (cast) =>
  (Array.isArray(cast) ? cast : String(cast || "").split(","))
    .map((name) => String(name).trim())
    .filter(Boolean);

// 인물은 .md 영화(개별 페이지 있음)와 왓챠 데이터셋(1045편, 페이지 없음)을 합쳐
// 만든다. 같은 영화가 양쪽에 있으면 tmdbId로 합치고 .md 쪽(내부 링크)을 쓴다.
function allFilms(movies = getAllMovies(), watched = getWatched()) {
  const mdByTmdb = new Set();
  const films = [];
  for (const m of movies) {
    films.push({
      key: m.slug,
      title: m.title,
      title_ko: m.title_ko || "",
      year: m.year || "",
      poster: m.poster || "",
      rating: m.rating ?? null,
      director: m.director_ko || m.director || "",
      cast: splitCast(m.cast),
      href: `/movies/${m.slug}`,
    });
    if (m.tmdbId) mdByTmdb.add(String(m.tmdbId));
  }
  for (const m of watched) {
    if (m.tmdbId && mdByTmdb.has(String(m.tmdbId))) continue; // .md에 이미 있음
    films.push({
      key: m.code || String(m.tmdbId),
      title: m.title,
      title_ko: m.title_ko || "",
      year: m.year || "",
      poster: m.poster || "",
      rating: m.rating ?? null,
      director: m.director_ko || m.director || "",
      cast: splitCast(m.cast),
      // 데이터셋 영화는 개별 페이지가 없어 TMDB로 보낸다
      href: tmdbUrl(m.tmdbId, m.media),
    });
  }
  return films;
}

// 전체 인물 그래프는 2.69MB라 Next Data Cache 2MiB 한도를 넘었다. 목록과 검색에는
// 작품 객체 전체가 필요하지 않으므로 이름·개수·검색 문자열·대표 이미지만 캐시한다.
// 상세는 아래에서 이름별 한 건으로 따로 캐시한다.
const cachedPeopleSummaries = unstable_cache(
  async () => {
    const [movies, watched] = await Promise.all([getAllMoviesMeta(), getWatchedRuntime()]);
    return getPeopleSummaries(allFilms(movies, watched));
  },
  ["lyra-people-summaries-v2"],
  { tags: ["lyra-content", "lyra-movies", "lyra-data"], revalidate: PEOPLE_TTL_SECONDS }
);

export async function getAllPeopleRuntime() {
  return cachedPeopleSummaries();
}

export async function getPersonRuntime(name) {
  if (!databaseContentEnabled()) return getPerson(name);

  // 상세 한 명을 위해 2,545명 전체 그래프를 만들지 않는다. 영화 약 1,095편을 한 번
  // 훑어 이 인물의 작품만 모으고, 결과는 이름별 Data Cache에 둔다.
  const cachedPerson = unstable_cache(
    async () => {
      const [movies, watched] = await Promise.all([getAllMoviesMeta(), getWatchedRuntime()]);
      return getPerson(name, allFilms(movies, watched));
    },
    ["lyra-person-v2", name],
    { tags: ["lyra-content", "lyra-movies", "lyra-data"], revalidate: PEOPLE_TTL_SECONDS }
  );
  return cachedPerson();
}

export function getAllPeople(films = allFilms()) {
  const people = new Map();
  const add = (name, role, film) => {
    if (!name) return;
    if (!people.has(name)) people.set(name, { name, directed: [], acted: [] });
    const person = people.get(name);
    const list = role === "director" ? person.directed : person.acted;
    if (!list.some((f) => f.key === film.key)) list.push(film);
  };
  for (const film of films) {
    add(film.director, "director", film);
    for (const actor of film.cast) add(actor, "actor", film);
  }

  return [...people.values()]
    .map((person) => {
      const works = [...new Map([...person.directed, ...person.acted].map((f) => [f.key, f])).values()]
        .sort((a, b) => String(b.year).localeCompare(String(a.year)));
      const rated = works.filter((f) => f.rating != null);
      return {
        ...person,
        works,
        averageRating: rated.length ? rated.reduce((n, f) => n + f.rating, 0) / rated.length : null,
      };
    })
    .sort((a, b) => b.works.length - a.works.length || a.name.localeCompare(b.name));
}

export function getPeopleSummaries(films = allFilms()) {
  return getAllPeople(films).map((person) => ({
    name: person.name,
    directedCount: person.directed.length,
    actedCount: person.acted.length,
    worksCount: person.works.length,
    image: person.works.find((work) => work.poster)?.poster || "",
    searchText: person.works
      .flatMap((work) => [work.title, work.title_ko])
      .filter(Boolean)
      .join(" "),
  }));
}

export function getPerson(name, films) {
  const source = films || allFilms();
  const directed = [];
  const acted = [];
  for (const film of source) {
    if (film.director === name) directed.push(film);
    if (film.cast.includes(name)) acted.push(film);
  }
  if (!directed.length && !acted.length) return null;
  const works = [...new Map([...directed, ...acted].map((film) => [film.key, film])).values()]
    .sort((a, b) => String(b.year).localeCompare(String(a.year)));
  const rated = works.filter((film) => film.rating != null);
  return {
    name,
    directed,
    acted,
    works,
    averageRating: rated.length ? rated.reduce((total, film) => total + film.rating, 0) / rated.length : null,
  };
}
