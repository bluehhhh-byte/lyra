import assert from "node:assert/strict";
import { parseBrowseFilters, serializeBrowseFilters } from "./browse-query.js";

const filters = { q: "밤 노래", tag: "록", emotion: "그리움", decade: "2010s", group: "artist" };
const query = serializeBrowseFilters(filters);
assert.deepEqual(parseBrowseFilters(new URLSearchParams(query)), filters, "모든 필터 조합이 URL 왕복 후 같아야 한다");
assert.deepEqual(parseBrowseFilters(new URLSearchParams("emotion=invalid&decade=20s&group=nope")), {
  q: "", tag: "", emotion: "", decade: "", group: "none",
});
assert.equal(serializeBrowseFilters({}), "");
console.log("✓ 곡 탐색 필터 조합 URL 직렬화·복원");
