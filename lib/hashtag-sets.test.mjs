// 해시태그 세트 — 영화 캐러셀 관리자에서 사람이 골라 캡션에 얹는 태그 묶음.
//
// 한때 곡 페이지도 이 풀에서 태그를 자동으로 채웠다. 다섯 개 한도가 생기면서
// 곡 캡션은 아티스트·제목·고정 셋으로 꽉 차, 자동 채움이 들어갈 자리가 없다.
// 그래서 이 파일이 지키는 건 하나다: 세트는 사람이 고를 때만 캡션에 들어간다.
import assert from "node:assert/strict";
import fs from "node:fs";
import { HASHTAG_MAX, buildMovieCarouselCaption, hashtagSetsFor } from "./caption.js";

const data = JSON.parse(fs.readFileSync(new URL("../data/instagram-hashtags.json", import.meta.url), "utf8"));
const movieSets = hashtagSetsFor(data, "movie");
assert.ok(movieSets.length >= 2, "영화 해시태그 세트가 데이터에 있어야 한다");

// 세트가 비어 있으면 고르는 화면은 남고 고를 것이 없다
for (const set of movieSets) assert.ok(set.tags.length > 0, `${set.id} 세트가 비어 있다`);

const now = new Date(2026, 6, 14, 15, 31);
const caption = buildMovieCarouselCaption({ headline: "여름 영화" }, now, movieSets[1].tags);
const tags = (caption.match(/#[\p{L}\p{N}_]+/gu) || []).map((tag) => tag.slice(1));

const captionLines = caption.split("\n");
assert.equal(captionLines[0], "| 여름 영화", "첫 줄은 크레딧");
// 이 묶음만의 태그가 윗줄, 모든 게시물에 붙는 고정 셋이 아랫줄
assert.match(captionLines[1], /^#/, "둘째 줄부터 해시태그");
assert.match(captionLines[2], /^#영화추천 /, "고정 셋은 따로 한 줄");
assert.equal(tags.length, HASHTAG_MAX, `태그 ${tags.length}개 — 한도는 ${HASHTAG_MAX}개다`);
assert.equal(tags[0], "Cyno", "계정 표식이 첫 자리");
// 고른 세트가 고정 셋을 밀어낸다 — 안 그러면 고르는 화면이 아무 일도 하지 않는다.
// 윗줄은 이 묶음만의 태그(표식 + 고른 것), 아랫줄은 모든 게시물에 붙는 고정 셋이다.
// 줄로 갈라 내보내므로 캡션에서 읽은 순서는 고른 순서와 다르다 — 무엇이 실렸는지를 본다
assert.deepEqual(
  [...tags].sort(),
  ["Cyno", ...movieSets[1].tags].slice(0, HASHTAG_MAX).sort(),
  "표식과 고른 세트가 다섯 자리를 채운다",
);
// 두 줄로 갈린다: 이 묶음만의 태그가 윗줄, 모든 게시물에 붙는 고정 셋이 아랫줄
const FIXED = ["영화추천", "오늘의영화", "영화기록"];
const tagsOn = (line) => line.match(/#[\p{L}\p{N}_]+/gu).map((tag) => tag.slice(1));
assert.ok(tagsOn(captionLines[1]).every((tag) => !FIXED.includes(tag)), "고정 셋이 윗줄에 섞였다");
assert.ok(tagsOn(captionLines[2]).every((tag) => FIXED.includes(tag)), "고정 셋이 아닌 것이 아랫줄에 있다");
assert.ok(!caption.includes("#260714"), "타임스탬프는 태그 예산을 쓰지 않는다");
assert.match(caption, /\(260714 15:31\)$/);

// 관리자 화면의 배선 — 세트를 서버에서 읽어 고르는 상자까지 내려보낸다
const page = fs.readFileSync(new URL("../app/admin/cyno-carousel/page.js", import.meta.url), "utf8");
const studio = fs.readFileSync(new URL("../app/admin/cyno-carousel/carousel-studio.js", import.meta.url), "utf8");
assert.match(page, /readRuntimeData\("instagram-hashtags\.json"/);
assert.match(studio, /해시태그 세트/);
assert.match(studio, /selectedSet\?\.tags/);

// 곡 페이지는 반대다. 세트를 읽지 않고, 캡션도 세트를 받지 않는다 — 죽은 배선을
// 남겨 두면 고른 적도 없는 태그가 들어가는 줄로 읽힌다.
const songPage = fs.readFileSync(new URL("../app/songs/[slug]/page.js", import.meta.url), "utf8");
const card = fs.readFileSync(new URL("../app/songs/[slug]/lyric-card.js", import.meta.url), "utf8");
assert.ok(!/instagram-hashtags\.json/.test(songPage), "곡 페이지가 아직 세트를 읽는다");
assert.ok(!/hashtagSets/.test(card), "카드가 아직 세트를 받는다");
assert.match(card, /buildCaption\(song, new Date\(\)\)/);

console.log("해시태그 세트 검증 통과");
