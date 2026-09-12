// 인스타그램 캡션 — 해시태그와 시각뿐이다.
//
// 한동안 훅·해설·곡 정보·권유 문구를 함께 실었다. 카드가 이미 그 내용을 다
// 담고 있어 같은 말이 두 번 나갔고, 게시물이 설명문이 됐다. 지금 캡션이 하는
// 일은 색인될 태그를 싣는 것과 언제 올렸는지 남기는 것뿐이다.
//   node --test lib/caption.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {
  INSTAGRAM_HASHTAG_LIMIT,
  buildCaption,
  buildMovieCaption,
  buildMovieCarouselCaption,
  captionPreview,
  hashtagSetsFor,
  instagramTag,
  suggestHashtags,
} from "./caption.js";

const dataset = JSON.parse(fs.readFileSync(new URL("../data/instagram-hashtags.json", import.meta.url), "utf8"));
const lyricSets = hashtagSetsFor(dataset, "lyric");
const movieSets = hashtagSetsFor(dataset, "movie");
const now = new Date(2026, 8, 12, 21, 40);

const korean = { artist: "신해경", title: "그대는 총천연색", year: "2018", lang: "ko", genre: "Indie Pop", emotion: "고독", keywords: ["밤", "새벽"], listen_when: "어두운 밤 혼자", comment: "긴 해설이 여기 있다." };
const english = { artist: "SUEDE", title: "Trash", year: "1998", lang: "en", genre: "Rock", emotion: "저항", keywords: ["거리"] };
const japanese = { artist: "10-FEET", title: "第ゼロ感", year: "2022", lang: "ja", genre: "J-Rock", emotion: "희망", keywords: ["꿈"] };

test("a caption is hashtags and a timestamp, and nothing else", () => {
  const caption = buildCaption(korean, now, [], { sets: lyricSets });
  const blocks = caption.split("\n\n");
  assert.equal(blocks.length, 2, "두 덩어리 — 태그, 그리고 시각");
  assert.match(blocks[0], /^#/, "첫 덩어리는 태그로 시작한다");
  assert.equal(blocks[1], "(260912 21:40)");

  // 카드가 이미 담고 있는 것을 캡션이 되풀이하지 않는다
  for (const echoed of [korean.listen_when, korean.comment, korean.title, "신해경 —"])
    assert.ok(!caption.includes(echoed), `캡션이 ${JSON.stringify(echoed)}를 되풀이한다`);
});

test("the timestamp stays out of the hashtag budget", () => {
  // 예전에는 #260714_1531처럼 태그였다. 아무도 검색하지 않는 그것이 30개 중
  // 한 자리를 먹었다.
  const caption = buildCaption(korean, now, [], { sets: lyricSets });
  assert.ok(!/#\d{6}/.test(caption), "시각이 태그로 들어가면 안 된다");
  assert.match(caption, /\(260912 21:40\)$/, "본문 괄호로 끝난다");
});

test("the precise tags come first, so the cap cuts the broad ones", () => {
  // 상한에 걸려 잘릴 때 잘리는 쪽은 넓은 태그여야 한다 — 그건 다른 게시물에도
  // 있지만 이 곡의 감정·키워드는 여기에만 있다.
  const tags = suggestHashtags(korean, { sets: lyricSets, max: 4 });
  assert.deepEqual(tags, ["신해경", "그대는총천연색", "고독", "밤"]);
});

test("three languages each stay inside Instagram's limits", () => {
  for (const song of [korean, english, japanese]) {
    const preview = captionPreview(buildCaption(song, now, [], { sets: lyricSets }));
    assert.deepEqual(preview.warnings, [], `${song.artist}: ${preview.warnings.join(", ")}`);
    assert.ok(preview.hashtags >= 10, `${song.artist}: 태그 ${preview.hashtags}개`);
    assert.ok(preview.hashtags <= INSTAGRAM_HASHTAG_LIMIT, `${song.artist}: 상한 초과`);
  }
});

test("a title nobody would search is not made into a tag", () => {
  // `#らしさ`는 길이 검사를 통과하지만 한국어 계정에서 아무도 검색하지 않는다
  assert.ok(!buildCaption(japanese, now, [], { sets: lyricSets }).includes("#第ゼロ感"));
  // 한국어 제목과 라틴 문자 제목은 그대로 쓸모가 있다
  assert.ok(buildCaption(korean, now, [], { sets: lyricSets }).includes("#그대는총천연색"));
  assert.ok(buildCaption(english, now, [], { sets: lyricSets }).includes("#Trash"));
});

test("a tag keeps the whole name instead of breaking at a space", () => {
  // Instagram은 공백·문장부호에서 태그를 끊는다 — 붙여야 이름이 한 태그로 남는다
  assert.equal(instagramTag("노래 추천"), "노래추천");
  assert.equal(instagramTag("R&B/Soul"), "RBSoul");
  assert.equal(instagramTag(""), "");
});

test("duplicates never take two slots", () => {
  const caption = buildCaption({ ...korean, keywords: ["신해경", "밤"] }, now, ["밤"], { sets: lyricSets });
  const tags = caption.match(/#[\p{L}\p{N}_]+/gu) || [];
  assert.equal(new Set(tags).size, tags.length);
});

test("movie captions follow the same shape", () => {
  const caption = buildMovieCaption(
    { director: "미셸 공드리", title: "이터널 선샤인", year: "2004", genre: "Romance", emotion: "사랑", themes: ["기억"] },
    now, [], { sets: movieSets },
  );
  assert.match(caption, /^#/);
  assert.match(caption, /\(260912 21:40\)$/);
  assert.ok(caption.includes("#영화로그"));
  assert.ok(!caption.includes("미셸 공드리 —"), "감독·제목 줄은 카드가 담는다");
});

test("a curation caption carries its own marker", () => {
  const caption = buildMovieCarouselCaption({ headline: "★5를 준 40편" }, now, [], { sets: movieSets });
  assert.ok(caption.includes("#Cyno"));
  assert.ok(!caption.includes("★5를 준 40편"), "헤드라인은 표지 카드가 담는다");
});
