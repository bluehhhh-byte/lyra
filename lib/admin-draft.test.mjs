import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {
  DRAFT_MAX_AGE_DAYS,
  NEW_SONG_SLUG,
  clearSongDraft,
  pruneSongDrafts,
  readSongDraft,
  songDraftKey,
  writeSongDraft,
} from "./admin/draft.js";

// 브라우저 없이 localStorage를 흉내 낸다 — key(i)/length까지 필요하다(prune).
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}
const silent = { warn: () => {} };
const NOW = Date.parse("2026-09-11T00:00:00Z");
const daysAgo = (n) => new Date(NOW - n * 86_400_000).toISOString();

test("a fresh draft round-trips", () => {
  const storage = fakeStorage();
  writeSongDraft(storage, "some-song", "본문", () => daysAgo(0));
  const draft = readSongDraft(storage, "some-song", { now: NOW, logger: silent });
  assert.equal(draft.raw, "본문");
  assert.equal(draft.savedAt, daysAgo(0));
});

test("a draft older than a week is dropped, and says so before it goes", () => {
  const storage = fakeStorage();
  writeSongDraft(storage, "old", "옛 내용", () => daysAgo(8));
  const warned = [];
  const draft = readSongDraft(storage, "old", { now: NOW, logger: { warn: (m) => warned.push(m) } });
  assert.equal(draft, null);
  assert.equal(storage.getItem(songDraftKey("old")), null, "읽는 김에 치운다");
  assert.equal(warned.length, 1, "조용히 사라지면 '저장했는데 없어졌다'가 된다");
  assert.match(warned[0], /버립니다/);
});

test("a draft on the boundary survives", () => {
  const storage = fakeStorage();
  writeSongDraft(storage, "edge", "아직", () => daysAgo(DRAFT_MAX_AGE_DAYS - 0.1));
  assert.ok(readSongDraft(storage, "edge", { now: NOW, logger: silent }));
});

test("a draft with no timestamp is not trusted", () => {
  const storage = fakeStorage({ [songDraftKey("weird")]: JSON.stringify({ raw: "x" }) });
  assert.equal(readSongDraft(storage, "weird", { now: NOW, logger: silent }), null);
});

test("pruning clears stale and corrupt entries, and leaves fresh ones", () => {
  const storage = fakeStorage();
  writeSongDraft(storage, "fresh", "a", () => daysAgo(1));
  writeSongDraft(storage, "stale", "b", () => daysAgo(30));
  storage.setItem(songDraftKey("broken"), "{{{");
  storage.setItem("unrelated:key", "건드리면 안 된다");

  const dropped = pruneSongDrafts(storage, { now: NOW, logger: silent });
  assert.equal(dropped.length, 2);
  assert.ok(readSongDraft(storage, "fresh", { now: NOW, logger: silent }));
  assert.equal(storage.getItem(songDraftKey("stale")), null);
  assert.equal(storage.getItem(songDraftKey("broken")), null);
  assert.equal(storage.getItem("unrelated:key"), "건드리면 안 된다", "우리 접두사만 훑는다");
});

test("storage that throws never breaks the editor", () => {
  const hostile = {
    get length() { throw new Error("차단됨"); },
    getItem() { throw new Error("차단됨"); },
    setItem() { throw new Error("차단됨"); },
    removeItem() { throw new Error("차단됨"); },
    key() { throw new Error("차단됨"); },
  };
  // 사생활 보호 모드·용량 초과 — 초안을 못 남기는 것이 편집을 막을 이유는 아니다
  assert.equal(writeSongDraft(hostile, "x", "y"), false);
  assert.equal(readSongDraft(hostile, "x", { logger: silent }), null);
  assert.deepEqual(pruneSongDrafts(hostile, { logger: silent }), []);
});

test("the registration form keeps a draft when saving fails, not when search does", () => {
  const form = fs.readFileSync(new URL("../app/admin/form.js", import.meta.url), "utf8");
  assert.match(form, /label === "save" \|\| label === "saveNoAi"/, "저장 실패만 보관한다");
  assert.match(form, /writeSongDraft\(window\.localStorage, NEW_SONG_SLUG/);
  assert.match(form, /clearSongDraft\(window\.localStorage, NEW_SONG_SLUG\)/, "저장에 성공하면 지운다");
  assert.match(form, /저장하지 못한 초안을 복원했습니다/, "복원 사실을 알려야 한다");
  assert.match(form, /초안 버리기/, "복원한 초안을 버릴 길도 있어야 한다");
  assert.ok(NEW_SONG_SLUG.length > 0);
});

test("the edit form preserves a draft on every save failure, not only expiry", () => {
  const edit = fs.readFileSync(new URL("../app/admin/edit/[slug]/edit-form.js", import.meta.url), "utf8");
  assert.doesNotMatch(edit, /if \(e\.sessionExpired\) writeSongDraft/, "세션 만료만 남기면 DB 장애 때 잃는다");
  assert.match(edit, /pruneSongDrafts\(window\.localStorage\)/);
});

test("the runbook covers every scenario the brief names, with real commands", () => {
  const runbook = fs.readFileSync(new URL("../docs/runbook-free-tier.md", import.meta.url), "utf8");
  for (const scenario of ["Neon", "429", "파일 폴백", "백업", "환경변수"]) {
    assert.ok(runbook.includes(scenario), `${scenario} 시나리오가 빠졌다`);
  }
  // 장애 한복판에서 없는 명령을 적어 두면 사람이 오타부터 의심한다
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  for (const [, script] of runbook.matchAll(/pnpm ([a-z][a-z0-9:-]+)/g)) {
    assert.ok(pkg.scripts[script], `package.json에 없는 명령을 안내한다: pnpm ${script}`);
  }
  for (const [, file] of runbook.matchAll(/node (scripts\/[a-z-]+\.mjs)/g)) {
    assert.ok(fs.existsSync(new URL(`../${file}`, import.meta.url)), `없는 스크립트를 안내한다: ${file}`);
  }
});

test("the fallback banner points at the runbook that exists", () => {
  const banner = fs.readFileSync(new URL("../app/admin/fallback-banner.js", import.meta.url), "utf8");
  assert.match(banner, /runbook-free-tier\.md/);
  assert.ok(fs.existsSync(new URL("../docs/runbook-free-tier.md", import.meta.url)));
});
