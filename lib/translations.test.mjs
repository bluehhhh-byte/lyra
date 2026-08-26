import assert from "node:assert/strict";
import { translationLines, translationPage } from "./translations.js";

const songs = [
  { slug: "one", title: "One", artist: "A", stanzas: [{ lines: [{ en: "a", ko: "가" }, { en: "b", ko: "" }] }] },
  { slug: "two", title: "Two", artist: "B", stanzas: [{ lines: [{ en: "c", ko: "나" }, { en: "d", ko: "다" }] }] },
];
assert.deepEqual(translationLines(songs).map((line) => line.text), ["가", "나", "다"]);
const first = translationPage(songs, 1, 2);
assert.equal(first.totalPages, 2);
assert.deepEqual(first.lines.map((line) => line.slug), ["one", "two"]);
assert.equal(translationPage(songs, 2, 2).lines[0].text, "다");
assert.equal(translationPage(songs, 3, 2), null);
console.log("✓ 번역 줄은 원곡 정보와 함께 페이지 단위로 분리");
