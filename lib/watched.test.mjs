// 왓챠 별점 목록 — Cyno의 두 기록 중 하나다. 개별 영화 파일을 JSON 하나로 옮긴 뒤
// 첫 화면에서 사라진 것처럼 보인 적이 있어(링크가 햄버거 안에만 있었다), 데이터가
// 계속 제자리에 있는지 여기서 지킨다.
//   node lib/watched.test.mjs
import assert from "node:assert/strict";
import { countryDistribution, directorPreferences, frequentActors, genreRatingCross, getWatched, ratingDistribution, rewatchGroups, runtimeInsights, yearlyRatingTrend } from "./watched.js";
import { getAllMovies } from "./movies.js";

const all = getWatched();
const rated = all.filter((m) => m.rating != null);

assert.ok(all.length >= 1000, `왓챠 기록이 너무 적다: ${all.length}편`);
assert.equal(rated.length, all.length, "별점 없는 항목이 섞여 있다");

// 별점은 0.5~5 사이의 반 칸 단위
for (const m of rated) {
  assert.ok(Number.isFinite(m.rating), `별점이 숫자가 아님: ${m.title}`);
  assert.ok(m.rating >= 0.5 && m.rating <= 5, `별점 범위 밖: ${m.title} ${m.rating}`);
  assert.equal(m.rating * 2, Math.round(m.rating * 2), `반 칸 단위가 아님: ${m.title} ${m.rating}`);
  assert.ok(String(m.title || "").trim(), "제목 없는 항목");
}

const mean = rated.reduce((n, m) => n + m.rating, 0) / rated.length;
assert.ok(mean > 2.5 && mean < 4.5, `평균 별점이 이상하다: ${mean}`);
console.log(`✓ 왓챠 별점 ${rated.length}편 · 평균 ★${mean.toFixed(2)}`);

// 감상 기록(movies/*.md)과 별점 평가(watcha-movies.json)는 서로 다른 기록이다.
// 별점 1,045편을 개별 파일로 되돌리는 실수를 막는다 — 서브내비가 세는 두 숫자다.
const curated = getAllMovies();
assert.ok(curated.length > 0 && curated.length < 200, `감상 기록 편수가 이상하다: ${curated.length}`);
assert.ok(rated.length > curated.length * 5, "별점 목록이 감상 기록 쪽으로 흡수된 것으로 보인다");
console.log(`✓ 감상 기록 ${curated.length}편 · 별점 평가 ${rated.length}편 — 서로 다른 기록`);

const insightFixture = [
  { rating: 3.5, year: "2020" },
  { rating: 4, year: 2020 },
  { rating: 5, year: "2021" },
  { rating: null, year: "2021" },
];
const distribution = ratingDistribution(insightFixture);
assert.equal(distribution.length, 10, "반 칸 별점 축 전체를 유지한다");
assert.deepEqual(
  distribution.filter((row) => row.count),
  [
    { rating: 3.5, count: 1, share: 1 / 3 },
    { rating: 4, count: 1, share: 1 / 3 },
    { rating: 5, count: 1, share: 1 / 3 },
  ]
);
assert.deepEqual(yearlyRatingTrend(insightFixture), [
  { year: 2020, count: 2, average: 3.75 },
  { year: 2021, count: 1, average: 5 },
]);
assert.deepEqual(yearlyRatingTrend([...insightFixture].reverse()), yearlyRatingTrend(insightFixture));
console.log("✓ 별점 분포와 연도별 평균은 결정적");

const directorFixture = [
  ...[5, 4.5, 4].map((rating) => ({ rating, director: "선호 감독" })),
  ...[2, 2.5, 3].map((rating) => ({ rating, director: "기피 감독" })),
  ...[5, 5].map((rating) => ({ rating, director: "표본 부족" })),
];
const directors = directorPreferences(directorFixture);
assert.equal(directors.min, 3);
assert.equal(directors.excluded, 1);
assert.deepEqual(directors.high.map((row) => row.k), ["선호 감독"]);
assert.deepEqual(directors.low.map((row) => row.k), ["기피 감독"]);
assert.ok(directors.high.every((row) => row.n >= 3));
assert.ok(directors.low.every((row) => row.n >= 3));
console.log("✓ 감독 편애·기피는 3편 미만을 제외");

const actors = frequentActors([
  { rating: 5, cast: ["배우 A", "배우 B"] },
  { rating: 4, cast: ["배우 A"] },
  { rating: 3, cast: ["배우 A", "배우 B"] },
  { rating: 2, cast: ["배우 B"] },
  { rating: null, cast: ["배우 A"] },
]);
assert.deepEqual(actors.map(({ k, n, avg }) => ({ k, n, avg })), [
  { k: "배우 A", n: 3, avg: 4 },
  { k: "배우 B", n: 3, avg: 10 / 3 },
]);
console.log("✓ 출연진 배열을 평탄화하고 3편 이상 배우의 평균을 계산");

const rewatches = rewatchGroups([
  { title: "같은 영화", year: 2020, tmdbId: 1, rating: 3.5 },
  { title_ko: "제목이 달라도", year: 2020, tmdbId: 1, rating: 4 },
  { title: "ID 없는 영화", year: 2021, rating: 5 },
  { title: " id 없는 영화 ", year: 2021, rating: 5 },
  { title: "한 번", year: 2022, rating: 4 },
]);
assert.equal(rewatches.length, 2);
assert.equal(rewatches.find((row) => row.key === "tmdb:1").ratingChanged, true);
assert.equal(rewatches.find((row) => row.key.startsWith("title:")).ratingChanged, false);
assert.equal(rewatchGroups(all).length, 0, "현재 원본에는 재관람 중복이 없다");
console.log("✓ 재관람을 TMDB 또는 제목·연도로 탐지하고 별점 변화를 구분");

const genres = genreRatingCross([
  { rating: 5, genre: "Drama" },
  { rating: 4, genre: "Drama" },
  { rating: 3, genre: "Drama" },
  { rating: 5, genre: "Talk" },
  { rating: 4.5, genre: "Talk" },
  { rating: 2, genre: "" },
]);
assert.equal(genres.maxCount, 3);
assert.equal(genres.deferred, 2);
assert.deepEqual(genres.rows.map(({ k, n, deferred }) => ({ k, n, deferred })), [
  { k: "Drama", n: 3, deferred: false },
  { k: "Talk", n: 2, deferred: true },
  { k: "미분류", n: 1, deferred: true },
]);
console.log("✓ 장르 편수와 별점 표본 판정을 분리");

const countries = countryDistribution([
  { country: "한국" },
  { country: " 영미 " },
  { country: "한국" },
  { country: "" },
  {},
]);
assert.equal(countries.total, 5);
assert.equal(countries.unclassified, 2);
assert.deepEqual(countries.rows, [
  { country: "미분류", count: 2, share: 0.4 },
  { country: "한국", count: 2, share: 0.4 },
  { country: "영미", count: 1, share: 0.2 },
]);
console.log("✓ 국가 분포는 미분류를 포함해 전부 보존");

const runtimes = runtimeInsights([
  { runtime: 89, year: 1999 },
  { runtime: "100", year: 2000 },
  { runtime: 149, year: 2004 },
  { runtime: 150, year: 2004 },
  { runtime: 180, year: 2005 },
  { runtime: "", year: 2005 },
]);
assert.equal(runtimes.known, 5);
assert.equal(runtimes.missing, 1);
assert.equal(runtimes.longCount, 2);
assert.deepEqual(runtimes.buckets.map((row) => row.count), [1, 1, 0, 1, 2]);
assert.deepEqual(runtimes.periods.map(({ start, end, known, long }) => ({ start, end, known, long })), [
  { start: 1995, end: 1999, known: 1, long: 0 },
  { start: 2000, end: 2004, known: 3, long: 1 },
  { start: 2005, end: 2009, known: 1, long: 1 },
]);
console.log("✓ 러닝타임 분포·장편 시기·누락을 함께 계산");

console.log("all passed");
