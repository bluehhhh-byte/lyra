// 추천 근거 검증 — 없는 곡·어긋난 어휘·동명곡 오연결이 새면 추천 카드가
// 아카이브에 없는 근거를 주장하게 된다. 그게 이 테스트가 막는 전부.
//   node lib/based-on.test.mjs
import assert from "node:assert/strict";
import { makeBasedOnCleaner } from "./admin/based-on.js";

const songs = [
  { slug: "radiohead-creep", title: "Creep", artist: "Radiohead" },
  { slug: "muse-hysteria", title: "Hysteria", artist: "Muse" },
  // 동명곡 한 쌍 — 제목만으로는 연결하면 안 된다
  { slug: "a-mirror", title: "Mirror", artist: "밴드A" },
  { slug: "b-mirror", title: "Mirror", artist: "밴드B" },
];
const clean = makeBasedOnCleaner(songs);

// 정상: 실존 곡·닫힌 어휘 통과
const ok = clean({
  songs: ["Creep - Radiohead", "없는 곡 - 아무개"],
  genres: ["Alternative Rock", "이상한장르"],
  emotions: ["불안", "행복하지않음"],
  reason: "서늘한 질감의 연장",
});
assert.deepEqual(ok.songs, [{ slug: "radiohead-creep", title: "Creep" }], "실존 곡만 slug 매핑");
assert.deepEqual(ok.genres, ["Alternative Rock"], "어휘 밖 장르 제거");
assert.deepEqual(ok.emotions, ["불안"], "목록 밖 감정 제거");
assert.equal(ok.reason, "서늘한 질감의 연장");
console.log("✓ 실존 검증 — 없는 곡·어휘 밖 값 제거");

// 제목만 준 경우: 유일하면 연결, 동명곡이면 버림
assert.deepEqual(clean({ songs: ["Hysteria"] }).songs, [{ slug: "muse-hysteria", title: "Hysteria" }], "유일 제목은 연결");
assert.deepEqual(clean({ songs: ["Mirror"] }).songs, [], "동명곡은 오연결 대신 버림");
assert.deepEqual(clean({ songs: ["Mirror - 밴드B"] }).songs, [{ slug: "b-mirror", title: "Mirror" }], "아티스트까지 주면 정확 연결");
console.log("✓ 동명곡 방어");

// 구형 문자열 호환 + 빈 값
assert.deepEqual(clean("옛 문자열 근거"), { songs: [], genres: [], emotions: [], reason: "옛 문자열 근거" });
assert.equal(clean(null), null);
assert.equal(clean({}).reason, "", "이유 없으면 빈 문자열");
console.log("✓ 구형 문자열·빈 값 호환");

console.log("all passed");
