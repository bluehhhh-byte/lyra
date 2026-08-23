// 캐시 무효화 전용 secret — 성공·실패 경로.
//
// 예전에는 migrate-content가 ADMIN_PASSWORD로 로그인해 관리자 API를 불렀다.
// 캐시를 비우자고 스크립트에 전체 권한을 쥐여 주는 구조였고, 로그인 흐름이
// 바뀔 때마다 조용히 깨졌다. 이제 이 키로 할 수 있는 일은 캐시 무효화뿐이다.
//
// same-origin은 신뢰 근거로 쓰지 않는다 — Origin 헤더는 서버 대 서버 요청에서
// 임의로 붙일 수 있고, 스크립트는 애초에 브라우저가 아니다.
//   node lib/revalidate-secret.test.mjs
import assert from "node:assert/strict";
import { timingSafeEqualString } from "./admin/secret.js";

// 1) 같은 값만 통과한다
{
  assert.equal(timingSafeEqualString("s3cret-value", "s3cret-value"), true);
  assert.equal(timingSafeEqualString("s3cret-value", "s3cret-valuf"), false, "한 글자만 달라도 실패");
  assert.equal(timingSafeEqualString("s3cret", "s3cret-value"), false, "길이가 달라도 실패");
  assert.equal(timingSafeEqualString("", ""), false, "빈 값은 인증이 아니다");
  assert.equal(timingSafeEqualString("x", ""), false);
  assert.equal(timingSafeEqualString(undefined, "x"), false);
  assert.equal(timingSafeEqualString(null, null), false);
  assert.equal(timingSafeEqualString(123, 123), false, "문자열이 아니면 거절");
}

// 2) 유니코드도 정확히 비교한다 — 해시 전에 utf8로 고정한다
{
  assert.equal(timingSafeEqualString("비밀-값", "비밀-값"), true);
  assert.equal(timingSafeEqualString("비밀-값", "비밀-갑"), false);
}

// 3) 라우트가 secret을 실제로 검사하고 same-origin에 기대지 않는다 — 소스로 확인.
// 라우트를 부르려면 next/cache 런타임이 필요해 단위 테스트에서 실행할 수 없다.
{
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const route = fs.readFileSync(path.join(root, "app/api/revalidate/route.js"), "utf8");

  assert.match(route, /timingSafeEqualString/, "secret 비교에 상수시간 함수를 써야 한다");
  assert.match(route, /REVALIDATE_SECRET/, "전용 secret을 읽어야 한다");
  assert.ok(!/sameOrigin/.test(route), "same-origin을 인증 근거로 쓰지 않는다");
  // 주석에 이름이 나오는 것은 상관없다. 실제로 값을 읽는지만 본다.
  assert.ok(!/process\.env\.ADMIN_PASSWORD/.test(route), "관리자 비밀번호를 읽지 않는다");
  assert.match(route, /status:\s*401/, "인증 실패는 401");
  assert.match(route, /status:\s*503/, "secret 미설정은 503으로 구분한다");

  // migration이 옛 로그인 경로를 더는 쓰지 않는다
  const migrate = fs.readFileSync(path.join(root, "scripts/migrate-content.mjs"), "utf8");
  assert.ok(!/api\/login/.test(migrate), "migration이 로그인 경로에 의존하면 안 된다");
  assert.match(migrate, /REVALIDATE_SECRET/, "migration은 전용 secret을 쓴다");
  assert.match(migrate, /업로드는 성공했으나 캐시를 비우지 못했습니다/, "업로드 성공과 캐시 실패를 구분해 알려야 한다");
  assert.match(migrate, /is distinct from/, "같은 내용이면 update하지 않아야 한다");
  assert.match(migrate, /DATA_ALLOWLIST/, "data 업로드는 allowlist로 제한한다");
  assert.ok(!/search-index\.json/.test(migrate.split("DATA_ALLOWLIST")[1]?.split("]")[0] || ""), "생성 산출물은 allowlist에 없어야 한다");
}

console.log("✓ 무효화 secret — 상수시간 비교, 전용 권한, migration 의존 제거");
