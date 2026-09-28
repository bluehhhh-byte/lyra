// 캐러셀 1장 문구(cover_hook) — 사람이 고르거나 쓴 한 줄을 곡 데이터에 저장한다.
//   node lib/cover-hook.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { COVER_HOOK_MAX, cleanCoverHook, coverHookStorable, setCoverHookField } from "./cover-hook.js";

// 정리 — 공백을 접고 두 줄 머리글에 들어갈 길이로 자른다
assert.equal(COVER_HOOK_MAX, 60);
assert.equal(cleanCoverHook("  내 모든 삶,\n  내 계절을  "), "내 모든 삶, 내 계절을");
assert.equal(cleanCoverHook("가".repeat(80)).length, COVER_HOOK_MAX);
assert.equal(cleanCoverHook(null), "");
assert.equal(cleanCoverHook(undefined), "");

// 프론트매터 파서는 [ ]로 감싼 값을 배열로 읽는다
assert.equal(coverHookStorable("[Chorus]"), false);
assert.equal(coverHookStorable("[여기] 있어"), true);
assert.equal(coverHookStorable(""), true, "빈 문구는 지우기라 저장 가능");

// 프론트매터 쓰기 — tags 뒤에 넣고, 있으면 바꾸고, 비우면 줄을 지운다
const doc = "---\ntitle: seasons\nartist: wave to earth\ntags: [한국, Indie Rock, 2023]\nemotion: 그리움\n---\nlyrics\n";
const set1 = setCoverHookField(doc, "내 모든 삶, 내 계절을 너에게 줄 거야");
assert.match(set1, /^tags: .*\ncover_hook: 내 모든 삶, 내 계절을 너에게 줄 거야\nemotion:/m);
assert.ok(set1.endsWith("---\nlyrics\n"), "본문은 그대로");
const set2 = setCoverHookField(set1, "다른 문구");
assert.equal((set2.match(/^cover_hook:/gm) || []).length, 1, "바꿀 때 줄이 늘지 않는다");
assert.match(set2, /^cover_hook: 다른 문구$/m);
assert.equal(setCoverHookField(set2, "   "), doc, "비우면 원래 문서로 돌아간다");
assert.match(setCoverHookField("---\ntitle: x\n---\nbody", "훅"), /^cover_hook: 훅$/m, "tags가 없어도 버리지 않는다");
assert.equal(setCoverHookField("본문뿐", "훅"), null, "프론트매터가 없으면 쓰지 않는다");
assert.match(setCoverHookField(doc.replace(/\n/g, "\r\n"), "훅"), /^cover_hook: 훅$/m, "CRLF 문서도 처리");

// ── listen_when 자동 문구는 사이트에서 사라졌다 ─────────────────────────
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
assert.ok(!fs.existsSync(new URL("./listen-when.js", import.meta.url)), "listen_when 규칙 모듈은 지웠다");
const meta = read("./admin/song-meta.js");
assert.ok(!/listen_when|listenWhen|LISTEN_WHEN/.test(meta), "가사 분석이 listen_when을 만들지 않는다");
const api = read("../app/api/admin/songs.js");
assert.ok(!/listen_when|listenWhen/.test(api), "저장·재생성 API가 listen_when을 쓰지 않는다");
assert.match(api, /action === "setCoverHook"/, "1장 문구를 곡에 저장하는 액션이 있다");
assert.match(api, /setCoverHookField\(song\.raw, coverHook\)/);

// ── 곡 페이지 ───────────────────────────────────────────────────────────
const page = read("../app/songs/[slug]/page.js");
assert.ok(!/listen_when/.test(page), "곡 페이지가 listen_when을 보여 주지 않는다(데이터에는 남아 있어도)");
assert.match(page, /data-cover-hook>\{coverHook\}/, "코멘트 위에 사람이 고른 문구가 선다");
assert.match(page, /cover_hook: coverHook,/, "캐러셀 창이 저장된 문구로 시작한다");

// ── 캐러셀 창 ───────────────────────────────────────────────────────────
const card = read("../app/songs/[slug]/lyric-card.js");
assert.ok(!/listen_when|localStorage\.getItem\(hookKey/.test(card), "문구는 브라우저가 아니라 곡 데이터에서 온다");
assert.match(card, /useState\(\(\) => cleanCoverHook\(song\.cover_hook\)\)/, "저장된 cover_hook으로 시작한다");
assert.match(card, /action: "setCoverHook"/, "주인은 곡에 저장한다");
assert.match(card, /if \(!owner \|\| !song\.slug \|\| hook === savedHook\) return;/, "주인이 고르면 따로 누르지 않아도 곡에 저장된다(주인이 아니면 저장 안 함)");
assert.match(card, /setTimeout\(\(\) => saveHook\(hook\), 900\)/, "입력이 멈춘 뒤에만 저장한다");
assert.match(card, /const hook = cleanCoverHook\(hookText\);/, "커버는 사람이 정한 문구만 그린다");
assert.match(card, /drawCoverCard\(\{ song, art, hook \}\)/, "캐러셀 창의 문구가 커버까지 전달된다");
assert.match(card, /htmlFor="cover-hook"/, "1페이지 문구 입력칸이 있다");
assert.match(card, /가사에서 고르기/, "가사에서 한 줄을 고를 수 있다");
// 제목이 두 줄인 곡에서 훅이 통째로 빠졌던 적이 있다 — 그릴지 말지는 문구 유무로만 정한다
assert.match(card, /if \(hook\) \{/, "훅은 자리 조건 없이 언제나 그린다");
assert.match(card, /const scrimHeight = hook \? 360 : 120/, "훅이 있으면 아트 아래 어둠막을 길게 끈다");
assert.match(card, /for \(const size of \[72, 66, 60, 54, 48, 42, 38, 34\]\)/, "머리글은 두 줄에 들어가는 가장 큰 크기로 그린다");
const carousel = read("./carousel.js");
assert.match(carousel, /800 72px "Pretendard Variable"/, "머리글 굵기도 미리 불러와야 한다");
assert.match(card, /headlineLines\.length <= 2/, "세 줄이 되면 머리글이 아니라 문단이다");
assert.match(card, /wrapTight\(ctx, hook, headlineMax/, "한 글자만 넘긴 줄은 당겨 붙인다");
assert.match(card, /shadowColor/, "밝은 앨범 아트 위에서도 흰 글자가 뭉개지지 않아야 한다");

// 2장(곡 설명)에는 문구를 넣지 않는다 — 곡 페이지 코멘트 위와 1장에만 선다
const about = card.slice(card.indexOf("async function drawAboutCard"), card.indexOf("async function downloadAll"));
assert.ok(!/hook/i.test(about), "곡 설명 카드는 문구를 그리지 않는다");

const view = read("../app/songs/[slug]/lyrics-view.js");
assert.match(view, /owner=\{owner\}/, "주인 여부를 캐러셀 창에 넘긴다(영화 페이지에서는 false)");
assert.match(view, /onHookSaved=\{onCoverHookSaved\}/, "저장 후 창을 다시 열어도 새 문구로 시작한다");
assert.match(view, /router\.refresh\(\)/, "저장 직후 곡 페이지 코멘트 위 문구가 바뀐다");

console.log("✓ cover_hook 정리·저장 · listen_when 제거");
