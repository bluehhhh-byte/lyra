import assert from "node:assert/strict";
import { rankedSearch, searchScore, sortSearchResults } from "./search-rank.js";

const items = [
  { title: "괴물의 노래", subtitle: "가수", meta: "괴물의 노래 가수" },
  { title: "괴물", subtitle: "고레에다 히로카즈", meta: "괴물 고레에다 히로카즈 드라마" },
  { title: "다른 작품", subtitle: "괴물", meta: "다른 작품 괴물" },
];
assert.equal(rankedSearch(items, "괴물")[0].title, "괴물", "정확한 제목을 먼저 배치");
assert.ok(searchScore(items[0], "괴물") > searchScore(items[2], "괴물"), "제목 일치가 부제 일치보다 우선");
const sortable = [
  { title: "밤의 노래", artist: "A", metaSearch: "밤의 노래 a", year: 1999, recorded: "2026-01-01" },
  { title: "밤", artist: "B", metaSearch: "밤 b", year: 2024, recorded: "2025-01-01" },
];
assert.equal(sortSearchResults(sortable, "밤", "relevance")[0].title, "밤");
assert.equal(sortSearchResults(sortable, "밤", "recent")[0].title, "밤의 노래");
assert.equal(sortSearchResults(sortable, "밤", "year")[0].title, "밤");
console.log("✓ 통합 검색 관련도 순위");
console.log("✓ 검색 결과 관련도·최신순·연도순 정렬");
