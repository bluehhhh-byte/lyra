// Jev 상투구 게이트 — 실패는 항상 null이어야 한다는 계약을 검증한다.
//   node lib/admin/jev.test.mjs
import assert from "node:assert/strict";
import { checkCliche, CLICHE_THRESHOLD, PROMO_END_UTC } from "./jev.js";

assert.ok(CLICHE_THRESHOLD > 0 && CLICHE_THRESHOLD <= 1, "임계값은 0과 1 사이여야 한다");

// 프로모션 종료 시각(2026-09-26 00:00 KST) 이후에는 키가 있어도 호출 자체를
// 건너뛴다 — 402/403을 반복 기다리지 않고 즉시 null.
{
  const saved = process.env.AI_GATEWAY_API_KEY;
  process.env.AI_GATEWAY_API_KEY = "test-key-not-real";
  const afterPromo = await checkCliche("아무 코멘트", { now: PROMO_END_UTC + 1000 });
  assert.equal(afterPromo, null, "프로모션 종료 이후는 키가 있어도 null");
  if (saved === undefined) delete process.env.AI_GATEWAY_API_KEY;
  else process.env.AI_GATEWAY_API_KEY = saved;
}

// 키가 없으면 네트워크를 두드리지 않고 즉시 null — 이 프로세스 실행 환경에는
// AI_GATEWAY_API_KEY가 없다고 가정한다(CI에 이 시크릿을 넣지 않았다).
{
  const saved = process.env.AI_GATEWAY_API_KEY;
  delete process.env.AI_GATEWAY_API_KEY;
  const result = await checkCliche("아무 코멘트");
  assert.equal(result, null, "키가 없으면 null");
  if (saved !== undefined) process.env.AI_GATEWAY_API_KEY = saved;
}

// 빈 코멘트도 null — 평가할 것이 없다
{
  const saved = process.env.AI_GATEWAY_API_KEY;
  process.env.AI_GATEWAY_API_KEY = "test-key-not-real";
  assert.equal(await checkCliche(""), null, "빈 문자열은 null");
  assert.equal(await checkCliche(null), null, "null 입력도 null");
  if (saved === undefined) delete process.env.AI_GATEWAY_API_KEY;
  else process.env.AI_GATEWAY_API_KEY = saved;
}

console.log("✓ Jev 게이트 — 실패는 항상 null, 절대 예외를 던지지 않는다");
