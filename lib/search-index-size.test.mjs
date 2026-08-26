import assert from "node:assert/strict";
import { searchIndexSizeWarning, SEARCH_INDEX_WARN_BYTES } from "./search-index-size.js";

assert.equal(searchIndexSizeWarning(SEARCH_INDEX_WARN_BYTES), "");
assert.match(searchIndexSizeWarning(SEARCH_INDEX_WARN_BYTES + 1), /경고 기준.*초과.*계속됨/);
console.log("✓ 검색 인덱스 크기 상한은 실패 대신 경고를 반환한다");
