// Genre validation must flag exactly the classes we've had to hand-fix.
//   node --test lib/genre.test.mjs
import assert from "node:assert/strict";
import { capGenre, genreTagOf, genreIssue, GENRES } from "./genre.js";

// capGenre maps store-locale words (한국어·일본어·스토어 영어 변형) and casing onto
// the English vocabulary — 오늘의 기록에 "ロック"이 그대로 렌더된 실사고의 회귀 방지
assert.equal(capGenre("얼터너티브"), "Alternative Rock");
assert.equal(capGenre("제이록"), "J-Rock");
assert.equal(capGenre("k-pop"), "K-Pop");
assert.equal(capGenre("R&B/Soul"), "R&B/Soul");
assert.equal(capGenre("ロック"), "Rock"); // 일본 스토어
assert.equal(capGenre("メタル"), "Metal");
assert.equal(capGenre("オルタナティブ"), "Alternative Rock");
assert.equal(capGenre("アニメ"), "Soundtrack");
assert.equal(capGenre("Alternative"), "Alternative Rock"); // 스토어 영어 변형
assert.equal(capGenre("Hip-Hop/Rap"), "Hip-Hop");
assert.equal(capGenre("Singer/Songwriter"), "Folk");
assert.equal(capGenre("R&B/소울"), "R&B/Soul");
assert.equal(capGenre("한국 힙합"), "Hip-Hop");
assert.equal(capGenre("일렉트로니카"), "Electronic");
assert.equal(capGenre("팝"), "Pop");

// genreTagOf picks the genre out of [country, genre, year]
assert.equal(genreTagOf(["한국", "Indie Rock", "2017"]), "Indie Rock");
assert.equal(genreTagOf(["영미", "2010"]), ""); // genre missing
assert.equal(genreTagOf(["일본", "J-Rock", "1999"]), "J-Rock");

// genreIssue flags the exact classes we hand-fixed, clears clean specific genres
assert.equal(genreIssue("얼터너티브"), "비표준 장르"); // Hangul leaked in
assert.equal(genreIssue("Alternative"), "비표준 장르"); // store genre, not our vocab
assert.equal(genreIssue(""), "장르 없음");
// Pink Floyd "Echoes"가 bare Rock으로 남아 있었는데, 어휘에 프로그레시브가 없어
// 세분화할 곳이 없었다. 기존 라벨에 억지로 끼우는 대신 어휘를 넓혔다.
assert.equal(genreIssue("Progressive Rock"), null);
assert.equal(capGenre("프로그레시브 록"), "Progressive Rock");
assert.equal(capGenre("프로그레시브 메탈"), "Progressive Rock");
assert.equal(genreIssue("Rock"), "세분화 권장"); // bare umbrella
assert.equal(genreIssue("Pop"), "세분화 권장");
assert.equal(genreIssue("Indie Rock"), null); // clean, specific → no issue
assert.equal(genreIssue("J-Rock"), null);
assert.equal(genreIssue("Heavy Metal"), null);

// locked=true 면 Rock/Pop이라도 다시 "세분화 권장"이 매겨지지 않는다 —
// 사람이 확정하고 Jev가 "정말 세분화 불가"를 독립적으로 확인한 곡은
// 대기열에서 영원히 못 빠지는 사고가 다시 일어나지 않는다(10cc <I'm Not In Love>).
assert.equal(genreIssue("Rock", true), null);
assert.equal(genreIssue("Pop", true), null);
assert.equal(genreIssue("Rock", false), "세분화 권장");
// locked는 비표준 장르나 장르 없음까지 구제하지 못한다 — 그 둘은 다른 문제다
assert.equal(genreIssue("얼터너티브", true), "비표준 장르");
assert.equal(genreIssue("", true), "장르 없음");

// every vocabulary term except the two umbrellas is issue-free
for (const g of GENRES) {
  if (g === "Rock" || g === "Pop") continue;
  assert.equal(genreIssue(g), null, `${g} should be a clean genre`);
}

console.log("✓ genre validation flags the right classes");
console.log("all passed");
