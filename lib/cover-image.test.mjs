import assert from "node:assert/strict";
import fs from "node:fs";

const cover = fs.readFileSync(new URL("../app/cover-image.js", import.meta.url), "utf8");
const watched = fs.readFileSync(new URL("../app/watched/grid.js", import.meta.url), "utf8");
const browse = fs.readFileSync(new URL("../app/movies/browse.js", import.meta.url), "utf8");
const detail = fs.readFileSync(new URL("../app/movies/[slug]/page.js", import.meta.url), "utf8");

assert.match(cover, /failed \|\| !img\.src/, "빈 src와 로드 실패를 모두 자리표시자로 바꾼다");
assert.match(cover, /onError=\{\(\) => setFailed\(true\)\}/, "404 이미지가 자리표시자로 전환된다");
assert.match(watched, /<CoverImage src=\{movie\.poster\}/, "왓챠 카드가 공통 폴백을 쓴다");
assert.match(browse, /<CoverImage[\s\S]*?src=\{movie\.poster\}/, "영화 목록이 공통 폴백을 쓴다");
assert.match(detail, /<CoverImage[\s\S]*?src=\{movie\.poster\}/, "영화 상세 대표 포스터가 공통 폴백을 쓴다");
assert.match(detail, /import CoverImage from "\.\.\/\.\.\/cover-image"/, "영화 상세가 폴백 컴포넌트를 실제로 import한다");
assert.match(detail, /\{\(movie\.backdrop \|\| movie\.poster\) && \(/, "배경 이미지에도 빈 src를 만들지 않는다");

console.log("✓ 영화 포스터는 빈 src와 404 모두 자리표시자로 대체");
