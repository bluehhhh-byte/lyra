import { getAllMovies } from "./movies.js";
import { getWatched } from "./watched.js";

// 배우 필드: .md는 "A, B, C" 문자열, 데이터셋은 ["A","B"] 배열 — 둘 다 받는다.
export const splitCast = (cast) =>
  (Array.isArray(cast) ? cast : String(cast || "").split(","))
    .map((name) => String(name).trim())
    .filter(Boolean);

// 인물은 .md 영화(개별 페이지 있음)와 왓챠 데이터셋(1045편, 페이지 없음)을 합쳐
// 만든다. 같은 영화가 양쪽에 있으면 tmdbId로 합치고 .md 쪽(내부 링크)을 쓴다.
function allFilms() {
  const mdByTmdb = new Set();
  const films = [];
  for (const m of getAllMovies()) {
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
  for (const m of getWatched()) {
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
      href: m.tmdbId ? `https://www.themoviedb.org/movie/${m.tmdbId}` : null,
    });
  }
  return films;
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

export function getPerson(name, films) {
  return getAllPeople(films).find((person) => person.name === name) || null;
}
