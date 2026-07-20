// Gemini decides keywords/emotion, so the parsers are the trust boundary —
// junk must become "nothing", never a broken chip or a diary day that lies.
//   node lib/keywords.test.mjs
import assert from "node:assert/strict";
import { EMOTIONS, parseEmotion, parseKeywords } from "./keywords.js";

// emotion: closed list only
assert.equal(parseEmotion("슬픔"), "슬픔");
assert.equal(parseEmotion("  분노 "), "분노", "trims");
for (const bad of ["슬픈", "sadness", "", null, undefined, 3, "행복"])
  assert.equal(parseEmotion(bad), "", `rejects ${JSON.stringify(bad)}`);
assert.ok(EMOTIONS.every((e) => parseEmotion(e) === e), "every term round-trips");
assert.equal(new Set(EMOTIONS).size, EMOTIONS.length, "no duplicate emotions");
console.log("✓ emotion is a closed vocabulary");

// keywords: array or comma string, both arrive from Gemini
assert.deepEqual(parseKeywords(["꿈", "레몬", "그림자"]), ["꿈", "레몬", "그림자"]);
assert.deepEqual(parseKeywords("꿈, 레몬 , 그림자"), ["꿈", "레몬", "그림자"], "comma string");
assert.deepEqual(parseKeywords(["#꿈", "꿈"]), ["꿈"], "strips # and dedupes");
assert.deepEqual(parseKeywords(["a", "b", "c", "d", "e", "f", "g"]).length, 5, "caps at 5");
console.log("✓ accepts the shapes Gemini actually returns");

// a whole lyric line sneaking in must not become a chip
assert.deepEqual(parseKeywords(["꿈이라면 얼마나 좋았을까요 정말로"]), [], "over-long entry dropped");
assert.deepEqual(parseKeywords(['한"줄']), [], "quote chars dropped (frontmatter safety)");
assert.deepEqual(parseKeywords([null, "", "  ", 7]), ["7"], "junk filtered, numbers stringified");
assert.deepEqual(parseKeywords(null), []);
assert.deepEqual(parseKeywords(undefined), []);
console.log("✓ junk and injection shapes are dropped");

console.log("all passed");
