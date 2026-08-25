import assert from "node:assert/strict";
import fs from "node:fs";

const queue = fs.readFileSync(new URL("../app/admin/publish-queue/page.js", import.meta.url), "utf8");
const studioPage = fs.readFileSync(new URL("../app/admin/cyno-carousel/page.js", import.meta.url), "utf8");
const studio = fs.readFileSync(new URL("../app/admin/cyno-carousel/carousel-studio.js", import.meta.url), "utf8");
const middleware = fs.readFileSync(new URL("../middleware.js", import.meta.url), "utf8");

assert.match(queue, /publishCandidates\(await getAllMoviesRuntime\(\)\)/, "기존 영화 메타데이터만 조합해야 한다");
assert.match(queue, /발행 이력은 따로 저장하지 않으므로/, "추천과 실제 발행 이력을 구분해 알려야 한다");
assert.match(queue, /\/admin\/cyno-carousel\?movie=/, "작품 후보가 제작실로 이어져야 한다");
assert.match(queue, /\/admin\/cyno-carousel\?concept=/, "테마 후보가 제작실로 이어져야 한다");
assert.doesNotMatch(queue, /gemini|write|database|\.json/i, "후보 화면은 AI나 새 상태 저장소를 사용하지 않는다");
assert.match(studioPage, /initialMovieId/);
assert.match(studioPage, /initialConcept/);
assert.match(studio, /initialConcept \? "concept" : "single"/);
assert.match(studio, /if \(mode !== "single" \|\| !selectedMovie\) return;/, "테마 후보를 여는 것만으로 AI 문구를 요청하면 안 된다");
assert.match(middleware, /"\/admin\/:path\*"/, "발행 후보 화면은 관리자 인증 범위 안이어야 한다");

console.log("publish queue admin boundary passed");
