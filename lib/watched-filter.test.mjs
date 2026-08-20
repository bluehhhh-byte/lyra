import assert from "node:assert/strict";
import { attachCuratedLinks, filterWatched, prepareWatched } from "./watched-filter.js";

const prepared = prepareWatched([
  { title: "Monster", title_ko: "괴물", director_ko: "고레에다 히로카즈", cast: ["안도 사쿠라"], country: "일본", genre: "드라마", year: 2023, rating: 4.5, tmdbId: 1 },
  { title: "Parasite", title_ko: "기생충", director_ko: "봉준호", cast: ["송강호"], country: "한국", genre: "스릴러", year: 2019, rating: 5, tmdbId: 2 },
]);

assert.equal(filterWatched(prepared, { q: "사쿠라" }).length, 1, "배우 검색");
assert.equal(filterWatched(prepared, { country: "한국", decade: "2010s" })[0].title_ko, "기생충", "복합 필터");
assert.equal(filterWatched(prepared, { rating: "4.5" })[0].title_ko, "괴물", "별점 필터");
assert.equal(attachCuratedLinks(prepared, [{ slug: "monster", tmdbId: 1, title: "Monster" }])[0].internalHref, "/movies/monster", "TMDB ID로 내부 기록 연결");

console.log("✓ Cyno 관람 이력 검색·필터·내부 연결");
