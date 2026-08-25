import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [adminPage, adminError, adminLoading, smoke, deploy, productionVerify] = await Promise.all([
  readFile(new URL("../app/admin/page.js", import.meta.url), "utf8"),
  readFile(new URL("../app/admin/error.js", import.meta.url), "utf8"),
  readFile(new URL("../app/admin/loading.js", import.meta.url), "utf8"),
  readFile(new URL("../scripts/smoke.mjs", import.meta.url), "utf8"),
  readFile(new URL("../scripts/deploy-production.ps1", import.meta.url), "utf8"),
  readFile(new URL("../scripts/verify-production.mjs", import.meta.url), "utf8"),
]);

assert.match(adminPage, /import Link from "next\/link"/, "관리자 내비게이션 import가 필요하다");
assert.match(smoke, /fetch\(BASE \+ "\/api\/login"/, "스모크가 관리자 로그인을 수행해야 한다");
assert.match(smoke, /headers: \{ cookie: authCookie \}/, "스모크가 인증 쿠키로 관리자 페이지를 열어야 한다");
assert.match(smoke, /body\.includes\("곡 추가"\)/, "스모크가 관리자 Server Component 본문을 확인해야 한다");
assert.match(deploy, /\$beforeDeployment/, "배포 전에 현재 운영 deployment ID를 기록해야 한다");
assert.match(deploy, /scripts\/verify-production\.mjs/, "배포 후 운영 검증 스크립트를 실행해야 한다");
assert.match(productionVerify, /verifyProduction/, "운영 검증 진입점이 공용 검증 로직을 사용해야 한다");
assert.match(adminError, /관리자 화면을 불러오지 못했습니다/, "관리자 전용 오류 화면이 필요하다");
assert.match(adminLoading, /관리자 화면 불러오는 중/, "관리자 전용 로딩 화면이 필요하다");

console.log("admin production stability contract passed");
