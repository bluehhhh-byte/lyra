import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const dialog = await readFile(new URL("../app/search-dialog.js", import.meta.url), "utf8");
const header = await readFile(new URL("../app/header.js", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/search/route.js", import.meta.url), "utf8");
assert.doesNotMatch(dialog, /search-index/);
assert.doesNotMatch(header, /search-index/);
assert.match(dialog, /fetch\(`\/api\/search\?q=/, "대화상자를 열고 검색할 때 API를 호출한다");
assert.match(route, /currentSearchIndex/, "무거운 인덱스 로더는 서버 API 경계 안에 있다");
const bytes = (await stat(new URL("../data/search-index.json", import.meta.url))).size;
assert.ok(bytes > 0);
console.log(`✓ 검색 인덱스 지연 로드 — 첫 화면에서 ${bytes.toLocaleString("en-US")} bytes 제외`);
