import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { toAdminSong } from "../lib/admin/admin-song.js";

const [adminPage, errorBoundary, loading, deployScript] = await Promise.all([
  readFile(new URL("../app/admin/page.js", import.meta.url), "utf8"),
  readFile(new URL("../app/admin/error.js", import.meta.url), "utf8"),
  readFile(new URL("../app/admin/loading.js", import.meta.url), "utf8"),
  readFile(new URL("./deploy-production.ps1", import.meta.url), "utf8"),
]);

const incomplete = toAdminSong({ title: "Only a title", stanzas: [{ lines: null }] });
assert.equal(incomplete.title, "Only a title");
assert.equal(incomplete.artist, "(아티스트 없음)");
assert.equal(incomplete.hasTranslation, false);
assert.match(adminPage, /songs\.map\(toAdminSong\)/, "관리자 목록은 방어 어댑터를 거쳐야 한다");
assert.match(adminPage, /admin_song_list_load_failed/, "관리자 서버 로드 실패를 구조화 로그로 남겨야 한다");
assert.match(errorBoundary, /^"use client";/, "관리자 error boundary는 Client Component여야 한다");
assert.match(errorBoundary, /onClick=\{reset\}/, "관리자 오류 화면에서 segment 재시도를 제공해야 한다");
assert.match(errorBoundary, /error\?\.digest/, "관리자 오류 화면에 안전한 오류 코드를 보여줘야 한다");
assert.match(loading, /role="status"/, "관리자 로딩 화면은 보조기기에 상태를 알려야 한다");
assert.match(deployScript, /scripts\/verify-production\.mjs/, "배포는 운영 인증 경계 검증을 실행해야 한다");
assert.match(deployScript, /"--force"/, "운영 배포는 캐시된 서버 청크 누락을 피하도록 전체 산출물을 다시 빌드해야 한다");

console.log("admin hardening verification passed");
