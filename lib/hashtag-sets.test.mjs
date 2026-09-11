import assert from "node:assert/strict";
import fs from "node:fs";
import { buildCaption, buildMovieCarouselCaption, hashtagSetsFor, suggestHashtags } from "./caption.js";

const data = JSON.parse(fs.readFileSync(new URL("../data/instagram-hashtags.json", import.meta.url), "utf8"));
const movieSets = hashtagSetsFor(data, "movie");
const lyricSets = hashtagSetsFor(data, "lyric");
assert.ok(movieSets.length >= 2, "영화 해시태그 세트가 데이터에 있어야 한다");
assert.deepEqual(lyricSets.map((set) => set.id), ["lyric-basic", "lyric-discovery"]);

// 세트가 비어 있으면 캡션의 대형 태그층이 통째로 사라진다 — 이 작업의 출발점이었다
for (const set of [...movieSets, ...lyricSets]) {
  assert.ok(set.tags.length > 0, `${set.id} 세트가 비어 있다`);
}

const now = new Date(2026, 6, 14, 15, 31);

// 캡션은 이제 여러 행이다(훅 → 해설 → 곡 정보 → CTA → 태그 → 시각).
// 예전 한 줄 형식(`| 가수 - 제목 #태그`)을 기대하던 단언은 그 변경에 맞춰 갱신했다.
const movieCaption = buildMovieCarouselCaption({ headline: "여름 영화" }, now, movieSets[1].tags, { sets: movieSets });
assert.match(movieCaption, /^여름 영화/, "훅이 첫 줄");
for (const tag of ["Cyno", "영화로그", ...movieSets[1].tags]) {
  assert.ok(movieCaption.includes(`#${tag}`), `#${tag}가 빠졌다`);
}
assert.ok(!movieCaption.includes("#260714"), "타임스탬프는 태그 예산을 쓰지 않는다");
assert.match(movieCaption, /\(260714 15:31\)$/);

const lyricCaption = buildCaption(
  { artist: "SUEDE", title: "Trash", year: "1998", lang: "en", genre: "Rock" },
  now,
  ["노래 추천", "가사"],
  { sets: lyricSets },
);
assert.ok(lyricCaption.includes("#SUEDE"));
assert.ok(lyricCaption.includes("#가사"), "고정 태그는 유지된다");
assert.ok(lyricCaption.includes("#노래추천"), "공백은 제거하고 한 태그로 붙인다");
const tags = lyricCaption.match(/#[\p{L}\p{N}_]+/gu) || [];
assert.equal(new Set(tags).size, tags.length, "중복 태그가 남으면 자리만 먹는다");

// extraTags는 세트보다 먼저 들어간다 — 사람이 고른 것이 기본 풀보다 우선이다
const picked = suggestHashtags({ artist: "SUEDE" }, { sets: lyricSets, extra: ["직접고른태그"], max: 3 });
assert.ok(picked.includes("직접고른태그"));

const page = fs.readFileSync(new URL("../app/admin/cyno-carousel/page.js", import.meta.url), "utf8");
const studio = fs.readFileSync(new URL("../app/admin/cyno-carousel/carousel-studio.js", import.meta.url), "utf8");
assert.match(page, /readRuntimeData\("instagram-hashtags\.json"/);
assert.match(studio, /해시태그 세트/);
assert.match(studio, /selectedSet\?\.tags/);

// 곡 페이지도 세트를 서버에서 읽어 카드 모달까지 내려보내야 한다 — 안 그러면
// 대형 태그층이 실제 게시물에는 영영 안 들어간다.
const songPage = fs.readFileSync(new URL("../app/songs/[slug]/page.js", import.meta.url), "utf8");
assert.match(songPage, /readRuntimeData\("instagram-hashtags\.json"/);
assert.match(songPage, /hashtagSets=\{hashtagSetsFor\(hashtagData, "lyric"\)\}/);
const card = fs.readFileSync(new URL("../app/songs/[slug]/lyric-card.js", import.meta.url), "utf8");
assert.match(card, /buildCaption\(song, new Date\(\), \[\], \{ sets: hashtagSets \}\)/);

console.log("해시태그 세트 검증 통과");
