import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../app/admin/song-tools.js", import.meta.url), "utf8");

assert.ok(!/\bregenAll\b/.test(src), "전곡 메타 재생성 반복문이 다시 추가됐다");
assert.ok(!/전체 메타/.test(src), "전곡 메타 재생성 버튼이 다시 추가됐다");
assert.ok(/onClick=\{\(\) => regenMeta\(s\.slug\)\}/.test(src), "곡별 메타 재생성 기능이 사라졌다");

console.log("✓ 전곡 메타 재생성은 없고 곡별 기능은 유지");
