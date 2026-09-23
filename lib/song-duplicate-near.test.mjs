// 표기만 다른 같은 원곡 후보 고르기 — 판정이 아니라 Jev(checkSameSong)에 물을
// 후보를 좁히는 단계다. 후보가 너무 넓으면 곡을 등록할 때마다 Jev를 여러 번
// 부르고, 너무 좁으면 "(Live)" 같은 표기 차이를 놓친다.
//   node lib/song-duplicate-near.test.mjs
import assert from "node:assert/strict";
import { nearDuplicateCandidates, findDuplicateSong } from "./admin/song-duplicate.js";

const songs = [
  { slug: "maroon-5-makes-me-wonder", title: "Makes Me Wonder", artist: "Maroon 5" },
  { slug: "radiohead-creep", title: "Creep", artist: "Radiohead" },
  { slug: "someone-up", title: "Up", artist: "Someone" },
];
const slugs = (list) => list.map((song) => song.slug);

// 라이브·리마스터·부제 표기 차이는 후보가 된다
assert.deepEqual(slugs(nearDuplicateCandidates({ title: "Makes Me Wonder (Live)", artist: "Maroon 5" }, songs)), ["maroon-5-makes-me-wonder"]);
assert.deepEqual(slugs(nearDuplicateCandidates({ title: "Makes Me Wonder - Remastered 2020", artist: "Maroon 5" }, songs)), ["maroon-5-makes-me-wonder"]);
assert.deepEqual(slugs(nearDuplicateCandidates({ title: "Creep [Acoustic]", artist: "radiohead" }, songs)), ["radiohead-creep"]);

// 정확히 같은 곡은 findDuplicateSong 몫이라 여기서는 빠진다
assert.equal(findDuplicateSong({ title: "Makes Me Wonder", artist: "Maroon 5" }, songs)?.slug, "maroon-5-makes-me-wonder");
assert.deepEqual(nearDuplicateCandidates({ title: "Makes Me Wonder", artist: "Maroon 5" }, songs), []);

// 다른 아티스트는 제목이 같아도 후보가 아니다
assert.deepEqual(nearDuplicateCandidates({ title: "Creep (Acoustic)", artist: "Stone Temple Pilots" }, songs), []);

// 네 글자 미만 조각으로는 묶지 않는다 — "Up"이 "Upside Down"을 품는다고 보지 않는다
assert.deepEqual(nearDuplicateCandidates({ title: "Upside Down", artist: "Someone" }, songs), []);

// 빈 입력
assert.deepEqual(nearDuplicateCandidates({}, songs), []);
assert.deepEqual(nearDuplicateCandidates({ title: "x", artist: "y" }, null), []);

console.log("✓ 표기만 다른 같은 원곡 후보");
