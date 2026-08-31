import assert from "node:assert/strict";
import { lyricVocabulary } from "./lyric-vocabulary.js";

const songs = [
  { slug: "one", title: "One", artist: "A", year: 2020, stanzas: [{ lines: [{ ko: "내가 푸른 밤에 망가져 마음을 숨겨" }] }] },
  { slug: "two", title: "Two", artist: "B", year: "2021", stanzas: [{ lines: [{ ko: "거야 밤은 마음이 마음을 망가진 채" }] }] },
  { slug: "three", title: "Three", artist: "C", year: "", stanzas: [{ lines: [{ ko: "있어 마음 저편의 벼랑에서" }] }] },
];
const rows = lyricVocabulary(songs);
assert.deepEqual(rows.slice(0, 2).map(({ word, count, songCount }) => ({ word, count, songCount })), [
  { word: "마음", count: 4, songCount: 3 },
  { word: "망가져", count: 2, songCount: 2 },
]);
const heart = rows[0];
assert.deepEqual(heart.years, [{ year: "2021", count: 2 }, { year: "2020", count: 1 }, { year: "연도 미상", count: 1 }]);
assert.equal(rows.find((row) => row.word === "망가져")?.count, 2, "활용형을 대표 이미지 어휘로 묶는다");
assert.equal(rows.find((row) => row.word === "벼랑")?.count, 1, "조사가 붙은 명사를 집계한다");
assert.equal(rows.find((row) => row.word === "밤")?.count, 2, "한 글자 이미지 어휘도 빠뜨리지 않는다");
assert.equal(rows.some((row) => ["내가", "거야", "있어", "푸른"].includes(row.word)), false, "기능어와 일반 수식어를 제외한다");
assert.deepEqual(lyricVocabulary([...songs].reverse()), rows, "입력 순서와 무관하게 결정적이다");
console.log("✓ 번역 가사 어휘를 전체·곡·연도별로 결정적 집계");
