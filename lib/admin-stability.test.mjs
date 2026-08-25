import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [adminPage, smoke, deploy] = await Promise.all([
  readFile(new URL("../app/admin/page.js", import.meta.url), "utf8"),
  readFile(new URL("../scripts/smoke.mjs", import.meta.url), "utf8"),
  readFile(new URL("../scripts/deploy-production.ps1", import.meta.url), "utf8"),
]);

assert.match(adminPage, /import Link from "next\/link"/, "관리자 내비게이션 import가 필요하다");
assert.match(smoke, /fetch\(BASE \+ "\/api\/login"/, "스모크가 관리자 로그인을 수행해야 한다");
assert.match(smoke, /headers: \{ cookie: authCookie \}/, "스모크가 인증 쿠키로 관리자 페이지를 열어야 한다");
assert.match(smoke, /body\.includes\("곡 추가"\)/, "스모크가 관리자 Server Component 본문을 확인해야 한다");
assert.match(deploy, /\$beforeDeployment/, "배포 전에 현재 운영 deployment ID를 기록해야 한다");
assert.match(deploy, /\$version\.deploymentId -eq \$beforeDeployment/, "배포 후 운영 별칭이 새 deployment로 바뀌었는지 확인해야 한다");

console.log("admin production stability contract passed");
