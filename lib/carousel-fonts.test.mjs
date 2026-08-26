import assert from "node:assert/strict";
import fs from "node:fs";
import { waitForCarouselFonts } from "./carousel.js";
import { MOVIE_CAROUSEL_FONT_FACES } from "./movie-carousel.js";

let release;
const events = [];
const fonts = {
  ready: new Promise((resolve) => { release = () => { events.push("ready"); resolve(); }; }),
  load: async (face) => { events.push(`load:${face}`); },
};
const waiting = waitForCarouselFonts(fonts, ["700 52px Test", "500 36px Test"]);
await Promise.resolve();
assert.deepEqual(events, [], "document.fonts.ready 전에 개별 폰트를 확인하면 안 된다");
release();
assert.equal(await waiting, true);
assert.deepEqual(events, ["ready", "load:700 52px Test", "load:500 36px Test"]);
assert.equal(await waitForCarouselFonts(null), false, "FontFaceSet이 없는 브라우저도 렌더링을 계속해야 한다");
assert.ok(MOVIE_CAROUSEL_FONT_FACES.some((face) => face.includes("Pretendard Variable")));

const lyric = fs.readFileSync(new URL("../app/songs/[slug]/lyric-card.js", import.meta.url), "utf8");
const movie = fs.readFileSync(new URL("../app/movies/[slug]/movie-card.js", import.meta.url), "utf8");
const studio = fs.readFileSync(new URL("../app/admin/cyno-carousel/carousel-studio.js", import.meta.url), "utf8");
assert.match(lyric, /waitForCarouselFonts\(\)/);
assert.match(movie, /await waitForCarouselFonts\(undefined, MOVIE_CAROUSEL_FONT_FACES\)/);
assert.match(studio, /waitForCarouselFonts\(undefined, MOVIE_CAROUSEL_FONT_FACES\)/);

console.log("캐러셀 폰트 준비 검증 통과");
