import assert from "node:assert/strict";
import fs from "node:fs";

const queue = fs.readFileSync(new URL("../app/admin/publish-queue/page.js", import.meta.url), "utf8");
const candidateCard = fs.readFileSync(new URL("../app/admin/publish-queue/publish-candidate-card.js", import.meta.url), "utf8");
const studioPage = fs.readFileSync(new URL("../app/admin/cyno-carousel/page.js", import.meta.url), "utf8");
const studio = fs.readFileSync(new URL("../app/admin/cyno-carousel/carousel-studio.js", import.meta.url), "utf8");
const middleware = fs.readFileSync(new URL("../middleware.js", import.meta.url), "utf8");

assert.match(queue, /Promise\.all\(\[[\s\S]*getAllMoviesRuntime\(\)[\s\S]*getWatchedRuntime\(\)[\s\S]*instagram-published\.json/, "감상 글·왓챠 기록·발행 이력을 함께 읽어야 한다");
assert.match(queue, /unwrittenHighRatedCandidates\(watched, movies\)/, "글 없는 고평점 후보를 분리해야 한다");
assert.match(queue, /readRuntimeData\("instagram-published\.json"/, "발행 완료 이력을 읽어 후보에서 제외해야 한다");
assert.match(candidateCard, /\/admin\/cyno-carousel\?movie=/, "작품 후보가 제작실로 이어져야 한다");
assert.match(queue, /\/admin\/cyno-carousel\?concept=/, "테마 후보가 제작실로 이어져야 한다");
assert.doesNotMatch(queue, /gemini/i, "후보 화면은 AI를 호출하지 않는다");
assert.match(studioPage, /initialMovieId/);
assert.match(studioPage, /initialConcept/);
assert.match(studio, /initialConcept \? "concept" : "single"/);
assert.match(studio, /if \(mode !== "single" \|\| !selectedMovie\) return;/, "테마 후보를 여는 것만으로 AI 문구를 요청하면 안 된다");
assert.match(middleware, /"\/admin\/:path\*"/, "발행 후보 화면은 관리자 인증 범위 안이어야 한다");

console.log("publish queue admin boundary passed");
