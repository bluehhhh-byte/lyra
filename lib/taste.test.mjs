// 취향 분석의 집계 로직 — 많이 본 것과 좋아하는 것을 나누고, 표본이 적은
// 그룹은 순위에서 뺀다. 이게 틀리면 "1편 본 감독"이 최애로 뜬다.
//   node lib/taste.test.mjs
import assert from "node:assert/strict";
import { aggregate, summarizeTaste, decadeOf, runtimeBucket } from "./taste-core.js";

const M = (rating, genre) => ({ rating, genre });
const rated = [
  M(5, "SF"), M(5, "SF"), M(4.5, "SF"),      // SF 3편, 평균 4.83
  M(2, "Comedy"), M(2.5, "Comedy"), M(3, "Comedy"), // Comedy 3편, 평균 2.5
  M(5, "Cult"),                                // Cult 1편 — 표본 부족
];

const g = aggregate(rated, (m) => m.genre, { min: 3, top: 8 });

// byCount: 편수 순
assert.deepEqual(g.byCount.map((r) => r.k), ["SF", "Comedy", "Cult"], "편수 순");

// byAvg: min 3편 이상만, 평균 높은 순 — Cult(1편)는 빠져야 한다
assert.deepEqual(g.byAvg.map((r) => r.k), ["SF", "Comedy"], "min표본 미달 제외");
assert.ok(g.byAvg[0].k === "SF" && g.byAvg[0].avg > 4.8, "SF가 편애 1위");
assert.ok(!g.byAvg.some((r) => r.k === "Cult"), "1편짜리는 순위에 없음");
console.log("✓ 표본 부족 그룹은 편애/기피 순위에서 제외");

// byLow: 평균 낮은 순
assert.equal(g.byLow[0].k, "Comedy", "Comedy가 박한 편 1위");
console.log("✓ 관람편수와 선호를 분리 집계");

// 배열 키(배우 여러 명) 평탄화
const withCast = [{ rating: 5, cast: ["A", "B"] }, { rating: 3, cast: ["A"] }];
const a = aggregate(withCast, (m) => m.cast, { min: 1, top: 8 });
assert.equal(a.byCount.find((r) => r.k === "A").n, 2, "배우 A는 2편");
assert.equal(a.byCount.find((r) => r.k === "B").n, 1, "배우 B는 1편");
console.log("✓ 배열 키(출연진) 평탄화");

// summarizeTaste: 요약 텍스트에 실제 집계 숫자가 들어가는지 (프롬프트 신뢰성)
const many = [];
for (let i = 0; i < 25; i++) many.push({ rating: 4, country: "일본", genre: "Animation", year: "2015", runtime: 100, director: "미야자키" });
for (let i = 0; i < 25; i++) many.push({ rating: 2, country: "미국", genre: "Action", year: "2000", runtime: 140, director: "베이" });
const s = summarizeTaste(many);
assert.equal(s.count, 50, "표본 수");
assert.ok(s.mean > 2.9 && s.mean < 3.1, "평균 3 근처");
assert.ok(s.lines.includes("일본") && s.lines.includes("Animation"), "요약에 그룹명 포함");
assert.ok(s.lines.includes("★4.00") || s.lines.includes("★2.00"), "요약에 그룹 평균 포함");
console.log("✓ summarizeTaste가 집계 숫자를 프롬프트에 담는다");

assert.equal(decadeOf("2015"), "2010s");
assert.equal(runtimeBucket(100), "90–110분");
assert.equal(runtimeBucket(0), null, "상영시간 0은 버킷 없음");
console.log("✓ 헬퍼(decade/runtime)");

console.log("all passed");
