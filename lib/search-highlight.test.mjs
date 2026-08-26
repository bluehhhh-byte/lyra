import assert from "node:assert/strict";
import { highlightSegments } from "./search-highlight.js";

const original = "Dark dark DARKness";
const parts = highlightSegments(original, "dark");
assert.equal(parts.map((part) => part.text).join(""), original, "표시 조각을 합치면 원문과 완전히 같아야 한다");
assert.deepEqual(parts.filter((part) => part.match).map((part) => part.text), ["Dark", "dark", "DARK"]);
assert.deepEqual(highlightSegments("원문", "없음"), [{ text: "원문", match: false }]);
assert.deepEqual(highlightSegments("원문", ""), [{ text: "원문", match: false }]);
console.log("✓ 검색 강조 조각은 대소문자·원문을 보존한다");
