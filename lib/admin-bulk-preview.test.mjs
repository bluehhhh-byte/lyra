import assert from "node:assert/strict";
import fs from "node:fs";

const api = fs.readFileSync(new URL("../app/api/admin/songs.js", import.meta.url), "utf8");
const bulk = fs.readFileSync(new URL("../app/admin/bulk-work.js", import.meta.url), "utf8");
const backfill = fs.readFileSync(new URL("../app/admin/backfill.js", import.meta.url), "utf8");
const lint = fs.readFileSync(new URL("../app/admin/lint.js", import.meta.url), "utf8");
const requality = fs.readFileSync(new URL("../app/admin/requality.js", import.meta.url), "utf8");

assert.match(api, /const shouldApply = body\.apply === true/);
assert.match(api, /if \(shouldApply && pending\.length\)/, "dry-run은 저장 함수를 부르면 안 된다");
assert.match(api, /preview: !shouldApply/);
assert.match(bulk, /api\("bulkApply", \{ items: parseItems\(\), apply: false \}\)/);
assert.match(bulk, /api\("bulkApply", \{ items: parseItems\(\), apply: true \}\)/);
assert.match(bulk, /미리보기대로/);
assert.match(backfill, /if \(!confirm\(/, "전체 누락 보정은 확인 없이 실행되면 안 된다");
assert.match(lint, /if \(!confirm\(/, "형식 자동 수정은 확인 없이 실행되면 안 된다");
assert.match(requality, /if \(!confirm\(/, "가사 전체 교체 확인 경계를 유지한다");

console.log("관리자 일괄 작업 미리보기 검증 통과");
