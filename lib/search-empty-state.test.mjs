import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const dialog = await readFile(new URL("../app/search-dialog.js", import.meta.url), "utf8");
const browse = await readFile(new URL("../app/browse.js", import.meta.url), "utf8");
assert.match(dialog, /검색어 지우기/);
assert.match(dialog, /전체 곡에서 찾아보기/);
assert.match(browse, /검색·필터 초기화/);
assert.match(browse, /setTag\(""\)[\s\S]*?setEmotion\(""\)[\s\S]*?setDecade\(""\)/);
console.log("✓ 검색 빈 결과에 다음 행동과 전체 필터 초기화 제공");
