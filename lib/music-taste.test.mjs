// 음악 취향 집계·해석 — /songs/taste가 통째로 이 위에 서 있다.
//   node lib/music-taste.test.mjs
import assert from "node:assert/strict";
import { summarizeMusicTaste, interpretMusicTaste } from "./music-taste-core.js";

const song = (over) => ({
  title: "t", artist: "a", year: "2005", tags: ["영미", "Indie Rock", "2005"],
  emotion: "고독", keywords: ["밤", "기억"], ...over,
});

const songs = [
  song({ artist: "Radiohead" }),
  song({ artist: "Radiohead", emotion: "불안" }),
  song({ artist: "Radiohead", emotion: "불안" }),
  song({ artist: "The Hives", tags: ["유럽", "Punk Rock", "2004"], year: "2004" }),
  song({ artist: "혁오", tags: ["한국", "Indie Rock", "2015"], year: "2015", emotion: "기쁨" }),
  song({ artist: "미상밴드", emotion: "" }),
];

const t = summarizeMusicTaste(songs);
assert.equal(t.count, 6);
assert.equal(t.genre[0][0], "Indie Rock", "최다 장르");
assert.equal(t.region[0][0], "영미", "최다 권역");
assert.equal(t.decade[0][0], "2000년대", "최다 연대");
// 고독 2 vs 불안 2 동률 — 가나다 tie-break로 고독. 빈 감정은 집계 제외
assert.equal(t.emotion[0][0], "고독", "최다 감정 (동률은 가나다, 빈 값 제외)");
assert.equal(t.emotion.reduce((n, [, c]) => n + c, 0), 5, "감정 있는 곡만 5곡");
assert.equal(t.artist[0][0], "Radiohead", "많이 담은 아티스트");
assert.equal(t.repeat.length, 1, "반복 아티스트 1팀");
assert.equal(t.once.length, 3, "한 곡 아티스트 3팀");
assert.ok(t.valenceMean < 0, "고독·불안 중심이면 음(어두움)의 기울기");
// 커버리지 — 감정 빠진 1곡이 감정 축에서만 빠져야 한다
assert.deepEqual(t.covered, { genre: 6, emotion: 5, decade: 6 }, "축별 근거 곡 수");
console.log("✓ 집계 — 장르·권역·연대·감정·아티스트·기울기·커버리지");

const text = interpretMusicTaste(t);
assert.ok(text.includes("Indie Rock"), "해석에 최다 장르 언급");
assert.ok(text.includes("2000년대 곡"), "연대는 라벨만 (튜플 통째 출력 회귀 방지)");
assert.ok(!text.includes(","), "집계 튜플이 문장에 새지 않음");
assert.ok(text.endsWith("."), "문장으로 끝남");
assert.equal(interpretMusicTaste(summarizeMusicTaste(songs.slice(0, 2))), "", "5곡 미만이면 해석 없음");
console.log("✓ 해석 문단");

// 빈 컬렉션 — 초기 배포·데이터 읽기 실패에서 페이지가 하얗게 되면 안 된다
const empty = summarizeMusicTaste([]);
assert.equal(empty.count, 0);
assert.deepEqual(empty.genre, [], "빈 집계는 빈 배열");
assert.equal(interpretMusicTaste(empty), "", "빈 컬렉션은 해석 없음");
console.log("✓ 빈 컬렉션 무해");

console.log("all passed");
