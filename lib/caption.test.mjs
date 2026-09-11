// 캡션은 인스타그램이 색인하는 유일한 텍스트다. 곡이 가진 해설·감정·키워드가
// 거기 들어가는지, 30개 태그 예산을 낭비하지 않는지 못박는다.
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
  clipComment,
  creditLine,
  hashtagSetsFor,
  suggestHashtags,
} from "./caption.js";

// 2026-07-14 15:31 local (month is 0-based in the Date constructor)
const now = new Date(2026, 6, 14, 15, 31);
const dataset = JSON.parse(fs.readFileSync(new URL("../data/instagram-hashtags.json", import.meta.url), "utf8"));
const lyricSets = hashtagSetsFor(dataset, "lyric");

const korean = {
  artist: "신해경", title: "그대는 총천연색", year: "2018", lang: "ko",
  genre: "Dream Pop", emotion: "그리움", keywords: ["밤", "불빛"],
  listen_when: "어두운 밤 혼자 남아 마음을 들여다볼 때",
  comment: "잠들지 못한 시간의 노래다. 화자는 색을 잃은 세계에서 한 사람만 총천연색으로 본다. 그 대비가 곡 전체를 지탱한다. 네 번째 문장은 잘려야 한다.",
};
const english = {
  artist: "SUEDE", title: "Trash", year: "1998", lang: "en",
  genre: "Rock", emotion: "저항", keywords: ["쓰레기"],
  listen_when: "세상이 우리를 뭐라 부르든 상관없어지는 밤",
  comment: "버려진 것들의 자긍심에 대한 노래.",
};
const japanese = {
  artist: "サンボマスター", title: "世界はそれを愛と呼ぶんだぜ", year: "2006", lang: "ja",
  genre: "J-Rock", emotion: "희망", keywords: ["사랑"],
  listen_when: "목이 쉬도록 함께 부르고 싶은 밤",
  comment: "외침이 곧 위로가 되는 곡이다.",
};

test("a caption carries the hook, the note, the credit and a call to action", () => {
  const caption = buildCaption(korean, now, [], { sets: lyricSets });
  const [hook, body, info, cta] = caption.split("\n\n");
  assert.equal(hook, korean.listen_when, "첫 줄은 훅 — 넘기기 전에 읽히는 유일한 줄");
  assert.match(body, /^잠들지 못한 시간의 노래다/);
  assert.ok(!body.includes("네 번째 문장"), "해설은 세 문장에서 끊는다");
  assert.equal(info, "신해경 — 그대는 총천연색 (2018)");
  assert.match(cta, /프로필 링크/);
});

test("a foreign-language song says the post includes a translation", () => {
  assert.match(buildCaption(english, now, [], { sets: lyricSets }), /SUEDE — Trash \(1998\) · 번역 포함/);
  // 한국어 곡에는 번역이 없다 — 없는 것을 있다고 하지 않는다
  assert.ok(!buildCaption(korean, now, [], { sets: lyricSets }).includes("번역 포함"));
});

test("the timestamp stops spending a hashtag", () => {
  const caption = buildCaption(korean, now, [], { sets: lyricSets });
  assert.match(caption, /\(260714 15:31\)$/, "시각은 본문 괄호로 남는다");
  assert.ok(!caption.includes("#260714"), "아무도 검색하지 않는 태그가 예산을 쓰면 안 된다");
});

test("missing fields drop their line instead of leaving a gap", () => {
  const bare = { artist: "뉴진스", title: "Supernatural", lang: "ko" };
  const caption = buildCaption(bare, now, [], { sets: lyricSets });
  assert.ok(!caption.includes("\n\n\n"), "빈 줄이 겹치면 쓰다 만 글로 보인다");
  assert.match(caption, /^뉴진스 — Supernatural/, "훅도 해설도 없으면 곡 정보가 첫 줄");
});

test("hashtags mix the broad, the contextual and the exact", () => {
  const tags = suggestHashtags(korean, { sets: lyricSets });
  assert.ok(tags.includes("신해경"), "아티스트 — 정확층");
  assert.ok(tags.includes("그리움"), "감정 — 정확층");
  assert.ok(tags.includes("밤"), "키워드 — 정확층");
  assert.ok(tags.includes("드림팝"), "장르 — 맥락층");
  assert.ok(tags.includes("한국노래"), "언어 — 맥락층");
  assert.ok(tags.includes("가사"), "고정 풀 — 대형층");
  assert.ok(tags.length >= 10, `최소 10개는 나와야 한다 (${tags.length})`);
});

test("the exact layer survives when the budget is tight", () => {
  // 잘릴 때 잘리는 쪽은 넓은 태그여야 한다 — 그건 다른 게시물에도 있다
  const tags = suggestHashtags(korean, { sets: lyricSets, max: 4 });
  assert.equal(tags.length, 4);
  assert.ok(tags.includes("신해경"));
  assert.ok(!tags.includes("가사"), "대형 태그가 먼저 잘린다");
});

test("hashtags never exceed Instagram's ceiling, and never repeat", () => {
  const noisy = { ...korean, keywords: ["밤", "밤", "불빛"], emotion: "그리움" };
  const tags = suggestHashtags(noisy, { sets: lyricSets, extra: ["가사", "신해경"] });
  assert.equal(new Set(tags).size, tags.length, "중복 태그는 자리만 먹는다");
  assert.ok(tags.length <= INSTAGRAM_HASHTAG_LIMIT);
  assert.equal(captionPreview(buildCaption(noisy, now, [], { sets: lyricSets })).warnings.length, 0);
});

test("an unusable title is left out of the tags", () => {
  const long = { ...korean, title: "오늘보다 더 기쁜 날은 남은 생에 많지 않을 것이다" };
  assert.ok(!suggestHashtags(long, { sets: lyricSets }).some((t) => t.startsWith("오늘보다")));
  // 짧은 제목은 그대로 태그가 된다
  assert.ok(suggestHashtags(english, { sets: lyricSets }).includes("Trash"));
});

test("three languages each produce a complete caption under the limits", () => {
  for (const song of [korean, english, japanese]) {
    const caption = buildCaption(song, now, [], { sets: lyricSets });
    const preview = captionPreview(caption);
    assert.deepEqual(preview.warnings, [], `${song.artist}: ${preview.warnings.join(", ")}`);
    assert.ok(preview.hashtags >= 10, `${song.artist}: 태그 ${preview.hashtags}개`);
    assert.ok(caption.includes(song.listen_when), `${song.artist}: 훅이 빠졌다`);
    assert.match(caption, /프로필 링크/);
  }
});

test("clipComment cuts at a sentence, never mid-word", () => {
  assert.equal(clipComment("한 문장이다."), "한 문장이다.");
  assert.equal(clipComment(""), "");
  const three = clipComment("하나. 둘. 셋. 넷.");
  assert.equal(three, "하나. 둘. 셋.");
  // 문장 부호가 없으면 말줄임으로 끝을 알린다
  assert.match(clipComment("아주 긴 한 문장인데 부호가 없다 ".repeat(20)), /…$/);
});

test("movie captions follow the same shape", () => {
  const caption = buildMovieCaption(
    { director: "미셸 공드리", title: "이터널 선샤인", year: "2004", genre: "Romance", emotion: "사랑", comment: "기억을 지워도 결국 같은 사람에게 향한다. 그 사실이 이 영화의 전부다." },
    now, [], { sets: hashtagSetsFor(dataset, "movie") },
  );
  const [hook] = caption.split("\n\n");
  assert.equal(hook, "기억을 지워도 결국 같은 사람에게 향한다.", "훅은 감상 첫 문장");
  assert.match(caption, /미셸 공드리 — 이터널 선샤인 \(2004\)/);
  assert.match(caption, /프로필 링크/);
  assert.ok(caption.includes("#영화로그"));
  assert.ok(!caption.includes("#260714"));
});

test("a curation caption keeps its headline as the hook", () => {
  const caption = buildMovieCarouselCaption({ headline: "★5를 준 40편" }, now, [], { sets: hashtagSetsFor(dataset, "movie") });
  assert.match(caption, /^★5를 준 40편/);
  assert.ok(caption.includes("#Cyno"));
});

test("the shipped hashtag sets are actually filled", () => {
  // 비어 있던 세트가 이 작업의 출발점이었다 — 다시 비면 캡션의 대형층이 사라진다
  for (const kind of ["lyric", "movie"]) {
    const sets = hashtagSetsFor(dataset, kind);
    assert.ok(sets.length > 0, `${kind} 세트가 없다`);
    for (const set of sets) assert.ok(set.tags.length > 0, `${set.id}가 비어 있다`);
  }
});

test("a comment written without punctuation is still cut to size", () => {
  // 부호 없이 이어 쓴 해설이 통째로 실려 캡션이 640자가 된 적이 있다
  const runOn = "아주 긴 한 문장인데 부호가 없다 ".repeat(20);
  const clipped = clipComment(runOn);
  assert.ok(clipped.length <= 245, `${clipped.length}자 — 상한을 넘었다`);
  assert.match(clipped, /…$/);
  assert.ok(!clipped.endsWith(" …"), "낱말 중간에서 끊지 않는다");
});

test("a title that already ends in brackets does not get a second pair", () => {
  // "Another Brick in the Wall, Pt. 1, 2, 3 (Pink Floyd Cover) (2004)" — 괄호가
  // 두 번 나와 읽기 나빴다
  assert.equal(
    creditLine("Korn", "Another Brick in the Wall, Pt. 1, 2, 3 (Pink Floyd Cover)", "2004"),
    "Korn — Another Brick in the Wall, Pt. 1, 2, 3 (Pink Floyd Cover) · 2004",
  );
  assert.equal(creditLine("SUEDE", "Trash", "1998"), "SUEDE — Trash (1998)");
  assert.equal(creditLine("뉴진스", "Supernatural", ""), "뉴진스 — Supernatural");
});

test("a Japanese-only title is left out of the hashtags", () => {
  // #らしさ는 네 글자라 길이 검사를 통과하지만 한국어 계정에서 아무도 검색하지
  // 않는다 — 30개 예산에서 한 자리를 버리는 셈이다
  const jp = { artist: "Official髭男dism", title: "らしさ", lang: "ja", genre: "J-Pop", emotion: "저항" };
  const tags = suggestHashtags(jp, { sets: lyricSets });
  assert.ok(!tags.includes("らしさ"));
  assert.ok(tags.includes("Official髭男dism"), "아티스트명은 검색되는 이름이라 남긴다");

  // 한글 제목과 라틴 제목은 그대로 쓸모가 있다
  assert.ok(suggestHashtags(korean, { sets: lyricSets }).includes("그대는총천연색"));
  assert.ok(suggestHashtags(english, { sets: lyricSets }).includes("Trash"));
});
