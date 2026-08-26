import assert from "node:assert/strict";
import fs from "node:fs";
import { carouselDownloadEntries } from "./carousel.js";

const blobs = Array.from({ length: 5 }, (_, index) => ({ index }));
const entries = carouselDownloadEntries(blobs, "movie:봄 / 여름");
assert.deepEqual(entries.map(({ name }) => name), [
  "cyno-movie-봄-여름-01.png",
  "cyno-movie-봄-여름-02.png",
  "cyno-movie-봄-여름-03.png",
  "cyno-movie-봄-여름-04.png",
  "cyno-movie-봄-여름-05.png",
]);
assert.deepEqual(entries.map(({ blob }) => blob), blobs, "이미지 순서를 바꾸면 안 된다");
assert.throws(() => carouselDownloadEntries(blobs.slice(0, 4), "movie"), /5장이 모두 준비/);

const studio = fs.readFileSync(new URL("../app/admin/cyno-carousel/carousel-studio.js", import.meta.url), "utf8");
assert.match(studio, /carouselDownloadEntries\(blobs, carousel\.id\)/);
assert.match(studio, /navigator\.canShare/);
assert.match(studio, /for \(const file of files\)/, "공유를 지원하지 않아도 다섯 파일을 모두 저장해야 한다");

console.log("캐러셀 일괄 저장 검증 통과");
