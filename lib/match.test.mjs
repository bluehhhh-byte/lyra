// 백필 매칭 규칙 — 아티스트만 맞고 제목이 다른 곡을 채우면 커버·미리듣기가
// 통째로 엉뚱한 곡이 된다. 그 회귀가 이 테스트의 전부.
//   node lib/match.test.mjs
import assert from "node:assert/strict";
import { titleMatch, artistMatches, pickTrack } from "./admin/match.js";

// 제목 규칙
assert.equal(titleMatch("The Ivy", "The Ivy"), "exact");
assert.equal(titleMatch("「ぬけがら」", "ぬけがら"), "acceptable_version", "괄호 장식 허용");
assert.equal(titleMatch("The Ivy (Live At NHK Hall / 2012)", "The Ivy"), "reject", "live는 원제에 없으면 거부");
assert.equal(titleMatch("Creep (Acoustic)", "Creep"), "reject", "acoustic 거부");
assert.equal(titleMatch("Creep (Live)", "Creep (Live)"), "exact", "원제가 live면 그대로 일치");
assert.equal(titleMatch("Nukegara(Cut ver.)", "Nukegara"), "reject", "cut ver. 거부");
assert.equal(titleMatch("Something Else", "The Ivy"), "reject", "아티스트만 맞는 다른 곡 거부");
console.log("✓ 제목 — live/remix/버전 오매칭 거부");

// 아티스트 규칙
assert.ok(artistMatches("the HIATUS", "The HIATUS"));
assert.ok(artistMatches("Plastic tree", "Plastic Tree"));
assert.ok(!artistMatches("Radiohead", "Muse"));
console.log("✓ 아티스트 정규화 일치");

// 후보 선택 — 명확한 1건만
const target = { title: "Creep", artist: "Radiohead" };
assert.equal(pickTrack([{ title: "Creep", artist: "Radiohead" }], target).status, "exact");
assert.equal(pickTrack([{ title: "Creep (Live)", artist: "Radiohead" }], target).status, "unavailable", "live 후보뿐이면 채우지 않음");
assert.equal(pickTrack([], target).status, "unavailable");
// 서로 다른 제목의 후보가 여럿 비슷하면 자동 선택하지 않고 ambiguous
const multi = pickTrack(
  [{ title: "Creep (Version A)", artist: "Radiohead" }, { title: "Creep (Version B)", artist: "Radiohead" }],
  { title: "Creep (Version)", artist: "Radiohead" }
);
assert.equal(multi.status, "ambiguous", "복수 유사 후보는 ambiguous — 채우지 않음");
assert.equal(multi.hit, null);
console.log("✓ 후보 선택 — 모호하면 채우지 않음");

console.log("all passed");
