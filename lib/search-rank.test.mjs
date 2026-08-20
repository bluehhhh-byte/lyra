import assert from "node:assert/strict";
import { rankedSearch, searchScore } from "./search-rank.js";

const items = [
  { title: "괴물의 노래", subtitle: "가수", meta: "괴물의 노래 가수" },
  { title: "괴물", subtitle: "고레에다 히로카즈", meta: "괴물 고레에다 히로카즈 드라마" },
  { title: "다른 작품", subtitle: "괴물", meta: "다른 작품 괴물" },
];
assert.equal(rankedSearch(items, "괴물")[0].title, "괴물", "정확한 제목을 먼저 배치");
assert.ok(searchScore(items[0], "괴물") > searchScore(items[2], "괴물"), "제목 일치가 부제 일치보다 우선");
console.log("✓ 통합 검색 관련도 순위");
