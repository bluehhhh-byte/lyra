import assert from "node:assert/strict";
import { lyricVocabulary } from "./lyric-vocabulary.js";

const songs = [
  { slug: "one", title: "One", artist: "A", year: 2020, stanzas: [{ lines: [{ ko: "푸른 밤 푸른 마음" }] }] },
  { slug: "two", title: "Two", artist: "B", year: "2021", stanzas: [{ lines: [{ ko: "밤 마음 마음" }] }] },
  { slug: "three", title: "Three", artist: "C", year: "", stanzas: [{ lines: [{ ko: "마음 저편" }] }] },
];
const rows = lyricVocabulary(songs);
assert.deepEqual(rows.slice(0, 2).map(({ word, count, songCount }) => ({ word, count, songCount })), [
  { word: "마음", count: 4, songCount: 3 },
  { word: "푸른", count: 2, songCount: 1 },
]);
const heart = rows[0];
assert.deepEqual(heart.years, [{ year: "2021", count: 2 }, { year: "2020", count: 1 }, { year: "연도 미상", count: 1 }]);
assert.deepEqual(lyricVocabulary([...songs].reverse()), rows, "입력 순서와 무관하게 결정적이다");
console.log("✓ 번역 가사 어휘를 전체·곡·연도별로 결정적 집계");
