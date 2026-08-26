import assert from "node:assert/strict";
import fs from "node:fs";

const component = fs.readFileSync(new URL("../app/admin/error-message.js", import.meta.url), "utf8");
assert.match(component, /role="alert"/);
assert.match(component, /compact/);

const consumers = [
  "form.js", "backfill.js", "bulk-work.js", "lint.js", "lyrics-audit.js",
  "movie-form.js", "movie-tools.js", "requality.js", "song-tools.js", "watcha-import.js",
  "artwork-review.js", "deploy-control.js", "login/page.js", "moments/moment-form.js",
  "usage/usage-dashboard.js", "cyno-carousel/carousel-studio.js",
];
for (const file of consumers) {
  const source = fs.readFileSync(new URL(`../app/admin/${file}`, import.meta.url), "utf8");
  assert.match(source, /AdminErrorMessage/, `${file}이 공용 오류 표시를 사용해야 한다`);
}

const adminSources = consumers.map((file) => fs.readFileSync(new URL(`../app/admin/${file}`, import.meta.url), "utf8")).join("\n");
assert.doesNotMatch(adminSources, /\{(?:error|err) && <p[^>]*text-red/, "관리자 오류를 직접 그리는 경로가 남아 있다");

console.log("관리자 오류 표시 검증 통과");
