// 비밀값 비교 — 길이와 내용 모두에서 타이밍을 흘리지 않는다.
//
// `===`는 첫 불일치 바이트에서 끊긴다. 그 시간 차이로 값을 한 글자씩 맞춰 볼 수 있다.
// lib/auth-token.js가 HMAC 비교에 쓰는 것과 같은 태도를 여기서도 지킨다.
//
// 길이가 다르면 그 자체가 정보다. 먼저 해시로 고정 길이로 만든 뒤 비교해
// 길이 차이도 드러나지 않게 한다.
import crypto from "node:crypto";

export function timingSafeEqualString(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (!a || !b) return false;
  const ha = crypto.createHash("sha256").update(a, "utf8").digest();
  const hb = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(ha, hb);
}
