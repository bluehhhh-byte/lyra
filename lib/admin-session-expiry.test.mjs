import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ADMIN_SESSION_EXPIRED_CODE,
  ADMIN_SESSION_EXPIRED_MESSAGE,
  adminLoginUrl,
  adminSessionExpiry,
  safeAdminNext,
} from "./auth-token.js";

assert.equal(adminLoginUrl("/admin/edit/한글 곡"), "/admin/login?next=%2Fadmin%2Fedit%2F%ED%95%9C%EA%B8%80%20%EA%B3%A1");
assert.equal(adminLoginUrl("https://evil.example"), "/admin/login?next=%2Fadmin");
assert.equal(safeAdminNext("//evil.example"), "/admin");
assert.equal(safeAdminNext("/songs/song"), "/admin");
assert.equal(safeAdminNext("/admin/tools"), "/admin/tools");
assert.equal(adminSessionExpiry(500, {}, "/admin/edit/song"), null);
assert.deepEqual(adminSessionExpiry(401, {}, "/admin/edit/song"), {
  message: ADMIN_SESSION_EXPIRED_MESSAGE,
  loginUrl: "/admin/login?next=%2Fadmin%2Fedit%2Fsong",
});
assert.equal(adminSessionExpiry(400, { code: ADMIN_SESSION_EXPIRED_CODE }, "/admin").loginUrl, "/admin/login?next=%2Fadmin");

const middleware = fs.readFileSync(new URL("../middleware.js", import.meta.url), "utf8");
assert.match(middleware, /ADMIN_SESSION_EXPIRED_CODE/);
assert.match(middleware, /loginUrl: "\/admin\/login"/);

const form = fs.readFileSync(new URL("../app/admin/edit/[slug]/edit-form.js", import.meta.url), "utf8");
assert.match(form, /writeSongDraft\(window\.localStorage, slug, raw\)/, "세션 만료 직후에도 현재 내용을 보존해야 한다");
assert.match(form, /actionHref=\{error\?\.loginUrl\}/, "재로그인 링크를 보여줘야 한다");
assert.doesNotMatch(form, /catch \(e\)[\s\S]{0,180}clearSongDraft/, "저장 실패 시 초안을 지우면 안 된다");

const login = fs.readFileSync(new URL("../app/admin/login/page.js", import.meta.url), "utf8");
assert.match(login, /safeAdminNext/, "로그인 뒤 관리자 내부 경로로만 돌아가야 한다");

console.log("관리자 세션 만료 안내 검증 통과");
