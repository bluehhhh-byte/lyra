// Jev 게이트 모음 — 실패는 항상 null이어야 한다는 계약을 검증한다.
//   node lib/admin/jev.test.mjs
import assert from "node:assert/strict";
import {
  checkCliche, CLICHE_THRESHOLD,
  checkGenreSubdividable, GENRE_LOCK_THRESHOLD,
  checkAlbumIdentity, ALBUM_SUSPECT_THRESHOLD,
  PROMO_END_UTC,
  reviewSongMeta, scoreTranslationFidelity, checkSameSong, scoreReportGrounding,
} from "./jev.js";

assert.ok(CLICHE_THRESHOLD > 0 && CLICHE_THRESHOLD <= 1, "상투구 임계값은 0과 1 사이여야 한다");
assert.ok(GENRE_LOCK_THRESHOLD > 0 && GENRE_LOCK_THRESHOLD < 1, "장르 잠금 임계값은 0과 1 사이여야 한다");
assert.ok(ALBUM_SUSPECT_THRESHOLD > 0 && ALBUM_SUSPECT_THRESHOLD < 1, "앱범 의심 임계값은 0과 1 사이여야 한다");

// 세 게이트 모두: 프로모션 종료 시각(2026-09-26 00:00 KST) 이후에는 키가
// 있어도 호출 자체를 건너뛴다 — 402/403을 반복 기다리지 않고 즉시 null.
{
  const saved = process.env.AI_GATEWAY_API_KEY;
  process.env.AI_GATEWAY_API_KEY = "test-key-not-real";
  const after = PROMO_END_UTC + 1000;
  assert.equal(await checkCliche("아무 코멘트", { now: after }), null, "comment: 프로모션 종료 후 null");
  assert.equal(await checkGenreSubdividable("Pop", "제목", "아티스트", { now: after }), null, "genre: 프로모션 종료 후 null");
  assert.equal(
    await checkAlbumIdentity({ title: "t", artist: "a", album: "b" }, { now: after }),
    null,
    "album: 프로모션 종료 후 null"
  );
  if (saved === undefined) delete process.env.AI_GATEWAY_API_KEY;
  else process.env.AI_GATEWAY_API_KEY = saved;
}

// 키가 없으면 네트워크를 두드리지 않고 즉시 null — 이 프로세스 실행 환경에는
// AI_GATEWAY_API_KEY가 없다고 가정한다(CI에 이 시크릿을 넣지 않았다).
{
  const saved = process.env.AI_GATEWAY_API_KEY;
  delete process.env.AI_GATEWAY_API_KEY;
  assert.equal(await checkCliche("아무 코멘트"), null, "comment: 키 없으면 null");
  assert.equal(await checkGenreSubdividable("Pop", "제목", "아티스트"), null, "genre: 키 없으면 null");
  assert.equal(await checkAlbumIdentity({ title: "t", artist: "a", album: "b" }), null, "album: 키 없으면 null");
  if (saved !== undefined) process.env.AI_GATEWAY_API_KEY = saved;
}

// 빈 입력도 null — 평가할 것이 없다 (키는 있다고 가정해도 여기서 이미 걸러진다)
{
  const saved = process.env.AI_GATEWAY_API_KEY;
  process.env.AI_GATEWAY_API_KEY = "test-key-not-real";
  assert.equal(await checkCliche(""), null, "comment: 빈 문자열은 null");
  assert.equal(await checkCliche(null), null, "comment: null 입력도 null");
  assert.equal(await checkGenreSubdividable("", "제목", "아티스트"), null, "genre: 빈 장르는 null");
  assert.equal(await checkGenreSubdividable("Pop", "", "아티스트"), null, "genre: 빈 제목은 null");
  assert.equal(await checkAlbumIdentity({ title: "", artist: "a", album: "b" }), null, "album: 빈 제목은 null");
  assert.equal(await checkAlbumIdentity({ title: "t", artist: "", album: "b" }), null, "album: 빈 아티스트는 null");
  assert.equal(await checkAlbumIdentity({ title: "t", artist: "a", album: "" }), null, "album: 빈 앱범은 null");
  assert.equal(await checkAlbumIdentity({}), null, "album: 빈 객체는 null");
  if (saved === undefined) delete process.env.AI_GATEWAY_API_KEY;
  else process.env.AI_GATEWAY_API_KEY = saved;
}

// 새 게이트 4종도 같은 계약 — 프로모션 종료 후·키 없음·빈 입력이면 네트워크 전에 null
{
  const saved = process.env.AI_GATEWAY_API_KEY;
  const after = PROMO_END_UTC + 1000;
  process.env.AI_GATEWAY_API_KEY = "test-key-not-real";
  const pairs = [{ original: "a", translation: "가" }, { original: "b", translation: "나" }];
  assert.equal(await reviewSongMeta({ comment: "c", listenWhen: "l", emotions: ["사랑", "슬픔"] }, { now: after }), null, "meta: 프로모션 종료 후 null");
  assert.equal(await scoreTranslationFidelity(pairs, { now: after }), null, "translation: 프로모션 종료 후 null");
  assert.equal(await checkSameSong({ title: "t", artist: "a" }, { title: "t2", artist: "a" }, { now: after }), null, "same: 프로모션 종료 후 null");
  assert.equal(await scoreReportGrounding("집계", "리포트", { now: after }), null, "report: 프로모션 종료 후 null");
  assert.equal(await reviewSongMeta({}), null, "meta: 물을 것이 없으면 null");
  assert.equal(await reviewSongMeta({ comment: "c" }), null, "meta: 감정 목록 없이 코멘트만 있으면 null");
  assert.equal(await scoreTranslationFidelity([pairs[0]]), null, "translation: 한 쌍으로는 평가하지 않는다");
  assert.equal(await checkSameSong({ title: "t" }, { title: "t", artist: "a" }), null, "same: 아티스트 없으면 null");
  assert.equal(await scoreReportGrounding("", "리포트"), null, "report: 집계 없으면 null");
  delete process.env.AI_GATEWAY_API_KEY;
  assert.equal(await checkSameSong({ title: "t", artist: "a" }, { title: "t2", artist: "a" }), null, "same: 키 없으면 null");
  assert.equal(await scoreReportGrounding("집계", "리포트"), null, "report: 키 없으면 null");
  if (saved !== undefined) process.env.AI_GATEWAY_API_KEY = saved;
}

console.log("✓ Jev 게이트 전체 — 실패는 항상 null, 절대 예외를 던지지 않는다");
