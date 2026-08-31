import assert from "node:assert/strict";
import fs from "node:fs";

const form = fs.readFileSync(new URL("../app/admin/form.js", import.meta.url), "utf8");
const draft = fs.readFileSync(new URL("../app/admin/song-appearance-draft.js", import.meta.url), "utf8");
const api = fs.readFileSync(new URL("../app/api/admin/appearances.js", import.meta.url), "utf8");

assert.match(form, /한글 번역 제목/);
assert.match(form, /Yesterday → 어제/);
assert.ok(form.indexOf("<SongAppearanceDraft") > form.indexOf("한글 번역 제목"), "작품 입력창은 번역 제목 아래에 있어야 한다");
assert.match(form, /api\("appearanceSuggest"/);
assert.match(form, /timeoutMs: 60_000/, "AI 검색은 관리자 화면을 무한 대기시키지 않아야 한다");
assert.match(form, /api\("appearanceSave", \{ songSlug: slug/);
assert.match(draft, /찾지 못하면 빈칸으로 둡니다/);
assert.match(api, /suggestSongAppearance/);
assert.match(api, /searchMovies\(suggestion\.workTitle\)/);

console.log("✓ 곡 등록 화면의 번역 제목·작품 수록 입력 흐름");
