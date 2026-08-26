import assert from "node:assert/strict";
import fs from "node:fs";
import { buildCaption, buildMovieCarouselCaption, hashtagSetsFor } from "./caption.js";

const data = JSON.parse(fs.readFileSync(new URL("../data/instagram-hashtags.json", import.meta.url), "utf8"));
const movieSets = hashtagSetsFor(data, "movie");
assert.ok(movieSets.length >= 2, "영화 해시태그 세트가 데이터에 있어야 한다");
assert.deepEqual(hashtagSetsFor(data, "lyric").map((set) => set.id), ["lyric-basic", "lyric-discovery"]);

const now = new Date(2026, 6, 14, 15, 31);
const movieCaption = buildMovieCarouselCaption({ headline: "여름 영화" }, now, movieSets[1].tags);
assert.match(movieCaption, /#Cyno #영화로그 #영화추천 #오늘의영화 #260714_1531$/);
const lyricCaption = buildCaption({ artist: "SUEDE", title: "Trash", year: "1998" }, now, ["노래 추천", "가사"]);
assert.match(lyricCaption, /#SUEDE #가사 #노래추천 #260714_1531$/, "필수 #가사는 유지하고 중복을 제거해야 한다");

const page = fs.readFileSync(new URL("../app/admin/cyno-carousel/page.js", import.meta.url), "utf8");
const studio = fs.readFileSync(new URL("../app/admin/cyno-carousel/carousel-studio.js", import.meta.url), "utf8");
assert.match(page, /readRuntimeData\("instagram-hashtags\.json"/);
assert.match(studio, /해시태그 세트/);
assert.match(studio, /selectedSet\?\.tags/);

console.log("해시태그 세트 검증 통과");
