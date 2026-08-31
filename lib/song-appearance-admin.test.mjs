import assert from "node:assert/strict";
import fs from "node:fs";

const form = fs.readFileSync(new URL("../app/admin/form.js", import.meta.url), "utf8");
const draft = fs.readFileSync(new URL("../app/admin/song-appearance-draft.js", import.meta.url), "utf8");
const api = fs.readFileSync(new URL("../app/api/admin/appearances.js", import.meta.url), "utf8");
const songsApi = fs.readFileSync(new URL("../app/api/admin/songs.js", import.meta.url), "utf8");
const songTools = fs.readFileSync(new URL("../app/admin/song-tools.js", import.meta.url), "utf8");

assert.match(form, /한글 번역 제목/);
assert.match(form, /Yesterday → 어제/);
assert.ok(form.indexOf("<SongAppearanceDraft") > form.indexOf("한글 번역 제목"), "작품 입력창은 번역 제목 아래에 있어야 한다");
assert.match(form, /api\(\s*"appearanceSuggest"/);
assert.match(form, /timeoutMs: 60_000/, "AI 검색은 관리자 화면을 무한 대기시키지 않아야 한다");
assert.doesNotMatch(form, /Promise\.allSettled\(\[\s*api\("autotag"[\s\S]*appearanceSuggest/, "메타와 작품 검색을 서로 모르게 병렬 실행하지 않는다");
assert.match(form, /commentHint/);
assert.match(form, /researchComment/);
assert.match(form, /setAppearanceSearchState\("error"\)/);
assert.match(form, /api\("appearanceSave", \{ songSlug: slug/);
assert.match(draft, /빈칸은 ‘수록 정보 없음’ 판정이 아니므로/);
assert.match(api, /researchSongContext/);
assert.match(api, /withReason\("작품 정보 웹 검색을 완료하지 못했습니다"\)/);
assert.match(api, /status: 503/);
assert.match(api, /searchMovies\(suggestion\.workTitle\)/);
assert.match(api, /unchanged: true/, "같은 작품을 다시 찾은 경우 저장은 멱등적이어야 한다");
assert.match(songsApi, /researchSongContext\(\{/);
assert.match(songsApi, /appearanceSuggestion: research\.appearance/);
assert.match(songTools, /appearanceSave["'], \{ songSlug: slug, \.\.\.appearanceSuggestion \}/);

console.log("song appearance admin integration ok");
