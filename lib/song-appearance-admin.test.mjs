import assert from "node:assert/strict";
import fs from "node:fs";

const form = fs.readFileSync(new URL("../app/admin/form.js", import.meta.url), "utf8");
const draft = fs.readFileSync(new URL("../app/admin/song-appearance-draft.js", import.meta.url), "utf8");
const api = fs.readFileSync(new URL("../app/api/admin/appearances.js", import.meta.url), "utf8");
const songsApi = fs.readFileSync(new URL("../app/api/admin/songs.js", import.meta.url), "utf8");
const songTools = fs.readFileSync(new URL("../app/admin/song-tools.js", import.meta.url), "utf8");
const songPage = fs.readFileSync(new URL("../app/songs/[slug]/page.js", import.meta.url), "utf8");
const loseControl = fs.readFileSync(new URL("../songs/l-arc-en-ciel-浸食-lose-control.md", import.meta.url), "utf8");

assert.match(form, /한글 번역 제목/);
assert.match(form, /Yesterday → 어제/);
assert.ok(form.indexOf("<SongAppearanceDraft") > form.indexOf("한글 번역 제목"), "작품 입력창은 번역 제목 아래에 있어야 한다");
assert.match(form, /api\(\s*"appearanceSuggest"/);
assert.match(form, /timeoutMs: 60_000/, "AI 검색은 관리자 화면을 무한 대기시키지 않아야 한다");
assert.doesNotMatch(form, /Promise\.allSettled\(\[\s*api\("autotag"[\s\S]*appearanceSuggest/, "메타와 작품 검색을 서로 모르게 병렬 실행하지 않는다");
assert.match(form, /commentHint/);
assert.match(form, /researchComment/);
assert.match(form, /commentSources/);
assert.match(form, /commentBasis/);
assert.match(form, /setAppearanceSearchState\("error"\)/);
assert.match(form, /appearanceState === "needs_review"/);
assert.match(form, /api\("appearanceSave", \{ songSlug: slug/);
assert.match(draft, /빈칸은 ‘수록 정보 없음’ 판정이 아니므로/);
assert.match(draft, /웹 조사 참고/);
assert.match(api, /researchSongContext/);
// 그라운딩이 막히면 503으로 끝내던 자리다. 지금은 무료 소스(Apple Music·위키백과)로
// 후보를 찾아 일반 Gemini가 고른다 — 검색만 막혔지 생성은 살아 있기 때문이다.
// 바뀌지 않은 것: 못 찾은 것을 "수록 정보 없음"이라고 말하지 않는다.
assert.match(api, /suggestFromFreeSources/);
assert.doesNotMatch(api, /appearanceState: "empty"/, "빈손을 '없음'으로 내보내면 안 된다");
// 503으로 끝내지 않는다 — 후보를 못 찾아도 화면이 경고와 함께 열려 있어야
// 사람이 직접 입력할 수 있다. 실패를 성공으로 꾸미는 것과는 다른 문제다.
assert.match(api, /state: "needs_review"|appearanceState: free\.state/);
assert.match(api, /researchWarning/);
assert.match(api, /searchMovies\(suggestion\.workTitle\)/);
assert.match(api, /unchanged: true/, "같은 작품을 다시 찾은 경우 저장은 멱등적이어야 한다");
assert.match(songsApi, /researchSongContext\(\{/);
assert.match(songsApi, /appearanceSuggestion: research\.appearance/);
assert.match(songsApi, /comment_sources/);
assert.match(songsApi, /comment_basis/);
assert.match(songsApi, /setCommentWithProvenance/);
assert.equal((songsApi.match(/setField\(raw, "comment"/g) || []).length, 1, "모든 코멘트 쓰기는 provenance helper를 거쳐야 한다");
assert.match(songTools, /appearanceSave["'], \{ songSlug: slug, \.\.\.appearanceSuggestion \}/);
assert.match(songPage, /data-comment-sources/);
assert.match(songPage, /코멘트 근거/);
assert.match(loseControl, /^comment_basis: web_enriched$/m);
assert.match(loseControl, /^comment_sources: \[https:\/\/larc-en-ciel\.com\//m);

console.log("song research provenance integration ok");
