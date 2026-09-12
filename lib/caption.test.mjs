// 인스타그램 캡션 — 크레딧 한 줄, 해시태그, 시각.
//
// 한동안 훅·해설·권유 문구까지 실었다. 카드가 이미 그 내용을 담고 있어 같은
// 말이 두 번 나갔고, 게시물이 설명문이 됐다. 크레딧만 남긴다 — 이미지 없이
// 캡션만 읽어도 무슨 곡인지는 알아야 한다.
//   node --test lib/caption.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import {
  HASHTAG_MAX,
  buildCaption,
  buildMovieCaption,
  buildMovieCarouselCaption,
  captionPreview,
  creditLine,
  instagramTag,
  suggestHashtags,
} from "./caption.js";

const now = new Date(2026, 8, 12, 21, 40);
const tagsOf = (caption) => (caption.match(/#[\p{L}\p{N}_]+/gu) || []).map((t) => t.slice(1));

const korean = { artist: "신해경", title: "그대는 총천연색", year: "2018", lang: "ko", genre: "Indie Pop", emotion: "고독", keywords: ["밤", "새벽"], listen_when: "어두운 밤 혼자", comment: "긴 해설이 여기 있다." };
const english = { artist: "SUEDE", title: "Trash", year: "1998", lang: "en", genre: "Rock", emotion: "저항", keywords: ["거리"] };
const japanese = { artist: "10-FEET", title: "第ゼロ感", year: "2022", lang: "ja", genre: "J-Rock", emotion: "희망", keywords: ["꿈"] };

test("a caption is a credit line, hashtags, then the time", () => {
  const caption = buildCaption(korean, now);
  const blocks = caption.split("\n\n");
  assert.equal(blocks.length, 3, "세 덩어리 — 크레딧, 태그, 시각");
  assert.equal(blocks[0], "| 신해경 - 그대는 총천연색 (2018)");
  assert.match(blocks[1], /^#/, "가운데는 태그");
  assert.equal(blocks[2], "(260912 21:40)");

  // 카드가 담는 것을 캡션이 되풀이하지 않는다 — 크레딧 한 줄이 예외다
  for (const echoed of [korean.listen_when, korean.comment])
    assert.ok(!caption.includes(echoed), `캡션이 ${JSON.stringify(echoed)}를 되풀이한다`);
});

test("a year is not put in a second pair of parentheses", () => {
  // "… (Pink Floyd Cover) (2004)"는 괄호가 두 번 나와 읽기 나쁘다
  assert.equal(
    creditLine("Korn", "Another Brick in the Wall (Pink Floyd Cover)", "2004"),
    "Korn - Another Brick in the Wall (Pink Floyd Cover) · 2004",
  );
  assert.equal(creditLine("10cm", "스토커", "2021"), "10cm - 스토커 (2021)");
  assert.equal(creditLine("10cm", "스토커", ""), "10cm - 스토커", "연도가 없으면 빈 괄호를 만들지 않는다");
});

test("the timestamp stays out of the hashtag budget", () => {
  // 예전에는 #260714_1531처럼 태그였다. 아무도 검색하지 않는 그것이 30개 중
  // 한 자리를 먹었다.
  const caption = buildCaption(korean, now);
  assert.ok(!/#\d{6}/.test(caption), "시각이 태그로 들어가면 안 된다");
  assert.match(caption, /\(260912 21:40\)$/, "본문 괄호로 끝난다");
});

test("a song post carries five tags: the artist, the title, and the fixed three", () => {
  // 한때 언어·장르·감정·키워드까지 스무 개 남짓을 달았다. 게시물 아래가
  // 태그 벽이 됐다. 다섯 개가 한도다.
  assert.equal(HASHTAG_MAX, 5);
  assert.deepEqual(tagsOf(buildCaption(korean, now)), [
    "신해경", "그대는총천연색", "가사추천", "오늘의노래", "플레이리스트",
  ]);
});

test("emotion and keywords no longer buy a tag slot", () => {
  // 곡마다 달라지는 태그는 검색되지 않고 자리만 먹었다 — #고독, #밤이 그랬다
  const tags = tagsOf(buildCaption(korean, now));
  for (const dropped of [korean.emotion, ...korean.keywords, korean.genre])
    assert.ok(!tags.includes(dropped), `#${dropped}이 남아 있다`);
});

test("a person's pick outranks the fixed three", () => {
  // 세트를 고르는 수고를 했다면 그게 이 게시물의 뜻이다. 고정 셋은 기본값이다.
  const tags = suggestHashtags(korean, { extra: ["직접고른태그"] });
  assert.deepEqual(tags.slice(0, 3), ["신해경", "그대는총천연색", "직접고른태그"]);
  assert.equal(tags.length, HASHTAG_MAX);
});

test("a title nobody would search leaves the slot empty instead of filling it", () => {
  // `#第ゼロ感`은 한국어 계정에서 아무도 검색하지 않는다. 빈자리를 아무 태그로
  // 메우면 게시물마다 태그가 달라져 다섯 개로 줄인 뜻이 사라진다.
  const tags = tagsOf(buildCaption(japanese, now));
  assert.deepEqual(tags, ["10FEET", "가사추천", "오늘의노래", "플레이리스트"]);
  // 한국어 제목과 라틴 문자 제목은 그대로 쓸모가 있다
  assert.ok(buildCaption(korean, now).includes("#그대는총천연색"));
  assert.ok(buildCaption(english, now).includes("#Trash"));
});

test("three languages each stay inside Instagram's limits", () => {
  for (const song of [korean, english, japanese]) {
    const preview = captionPreview(buildCaption(song, now));
    assert.deepEqual(preview.warnings, [], `${song.artist}: ${preview.warnings.join(", ")}`);
    assert.ok(preview.hashtags <= HASHTAG_MAX, `${song.artist}: 태그 ${preview.hashtags}개`);
  }
});

test("a tag keeps the whole name instead of breaking at a space", () => {
  // Instagram은 공백·문장부호에서 태그를 끊는다 — 붙여야 이름이 한 태그로 남는다
  assert.equal(instagramTag("노래 추천"), "노래추천");
  assert.equal(instagramTag("R&B/Soul"), "RBSoul");
  assert.equal(instagramTag(""), "");
});

test("duplicates never take two slots", () => {
  // 아티스트를 사람이 또 고르면 같은 태그가 두 자리를 먹는다
  const tags = tagsOf(buildCaption(korean, now, ["신해경", "가사추천"]));
  assert.equal(new Set(tags).size, tags.length);
});

test("movie captions follow the same shape", () => {
  const caption = buildMovieCaption(
    { director: "미셸 공드리", title: "이터널 선샤인", year: "2004", genre: "Romance", emotion: "사랑", themes: ["기억"] },
    now,
  );
  assert.ok(caption.startsWith("| 미셸 공드리 - 이터널 선샤인 (2004)"), "감독 - 제목 (연도)");
  assert.match(caption, /\(260912 21:40\)$/);
  assert.deepEqual(tagsOf(caption), [
    "미셸공드리", "이터널선샤인", "영화추천", "오늘의영화", "영화기록",
  ]);
});

test("a curation caption carries its own marker", () => {
  const caption = buildMovieCarouselCaption({ headline: "★5를 준 40편" }, now);
  assert.ok(caption.startsWith("| ★5를 준 40편"), "묶음은 크레딧 자리에 헤드라인을 쓴다");
  // 감독도 제목도 없는 묶음이라 계정 표식이 첫 자리를 쓴다
  assert.deepEqual(tagsOf(caption), ["Cyno", "영화추천", "오늘의영화", "영화기록"]);
  // 사람이 고른 세트는 고정 셋보다 앞이다 — 안 그러면 다섯 개 안에서 밀려난다
  const picked = tagsOf(buildMovieCarouselCaption({ headline: "여름" }, now, ["여름영화", "재개봉"]));
  assert.deepEqual(picked.slice(0, 3), ["Cyno", "여름영화", "재개봉"]);
});
