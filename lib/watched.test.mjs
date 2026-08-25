// 왓챠 별점 목록 — Cyno의 두 기록 중 하나다. 개별 영화 파일을 JSON 하나로 옮긴 뒤
// 첫 화면에서 사라진 것처럼 보인 적이 있어(링크가 햄버거 안에만 있었다), 데이터가
// 계속 제자리에 있는지 여기서 지킨다.
//   node lib/watched.test.mjs
import assert from "node:assert/strict";
import { directorPreferences, getWatched, ratingDistribution, yearlyRatingTrend } from "./watched.js";
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

console.log("all passed");
