// 가사 검색 — 서버가 slug와 맞은 줄만 돌려준다. 전곡 인덱스(gzip 757KB)를
// 내려받던 회귀를 막는 상한들을 고정한다.
import assert from "node:assert/strict";
import { lyricMatches, LYRIC_HITS_MAX, LYRIC_QUERY_MAX, LYRIC_QUERY_MIN, normalizeSearchText, searchableLyricLines } from "./lyric-search.js";

const songs = [
  { slug: "a", lines: ["우리 함께 걸었던 길", "second line"] },
  { slug: "b", lines: ["나 혼자 걷는 밤"] },
  ...Array.from({ length: 400 }, (_, i) => ({ slug: `bulk${i}`, lines: ["함께라는 말"] })),
];

// 일치 — slug와 맞은 줄(스니펫)만
{
  const { hits } = lyricMatches(songs, "함께");
  assert.equal(hits[0].slug, "a");
  assert.equal(hits[0].line, "우리 함께 걸었던 길");
  assert.ok(hits.every((h) => typeof h.line === "string" && !Array.isArray(h.line)), "전체 가사 배열을 흘리지 않는다");
}

// 응답 상한 — 흔한 검색어도 응답이 몇 KB로 끝난다
assert.equal(lyricMatches(songs, "함께").hits.length, Math.min(401, LYRIC_HITS_MAX));

// 검색어 규칙 — 두 글자 미만·공백은 검색하지 않고, 길이는 상한에서 자른다
assert.equal(lyricMatches(songs, "함").hits.length, 0);
assert.equal(lyricMatches(songs, "   ").hits.length, 0);
assert.equal(lyricMatches(songs, "가".repeat(100)).q.length, LYRIC_QUERY_MAX);
assert.ok(LYRIC_QUERY_MIN >= 2);

// 대소문자 무시
assert.equal(lyricMatches(songs, "SECOND").hits[0]?.slug, "a");

// 외국어 원문에 붙은 한국어 번역도 가사 검색 인덱스에 들어간다
const foreign = {
  slug: "foreign",
  stanzas: [{ lines: [{ en: "The world has ended", ko: "세상이 끝났습니다" }] }],
};
const indexedForeign = [{ slug: foreign.slug, lines: searchableLyricLines(foreign) }];
assert.equal(lyricMatches(indexedForeign, "세상이").hits[0]?.slug, "foreign");
assert.equal(searchableLyricLines(foreign, { translations: false }).includes("세상이 끝났습니다"), false);

console.log("✓ 가사 검색 — 상한·검색어 규칙");

// 원문에 섞인 전각 공백·NBSP가 검색을 막던 문제. 원문은 고치지 않는 것이
// 원칙이라 데이터로는 못 없앤다 — 그래서 비교할 때만 공백을 접는다.
// 보여주는 줄은 저장된 글자 그대로여야 한다.
{
  const wide = "\u3000"; // 전각 공백
  const nbsp = "\u00a0";
  assert.equal(normalizeSearchText(`말${wide}하는`), "말 하는");
  assert.equal(normalizeSearchText(`A${nbsp}B`), "a b");
  assert.equal(normalizeSearchText("  a \u3000 b  "), "a b");

  const spaced = [{ slug: "wide", lines: [`목소리가${wide}들리는 밤`] }];
  const hit = lyricMatches(spaced, "목소리가 들리는").hits[0];
  assert.equal(hit?.slug, "wide", "보통 공백으로 친 검색어가 전각 공백 줄을 찾는다");
  assert.ok(hit.line.includes(wide), "결과로 돌려주는 줄은 원문 그대로여야 한다");

  // 반대 방향 — 검색어에 전각 공백이 들어와도 보통 공백 줄을 찾는다
  const plain = [{ slug: "plain", lines: ["목소리가 들리는 밤"] }];
  assert.equal(lyricMatches(plain, `목소리가${wide}들리는`).hits[0]?.slug, "plain");
}

console.log("✓ 가사 검색 — 공백 정규화");
