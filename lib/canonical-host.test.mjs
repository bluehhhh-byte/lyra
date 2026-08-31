// 운영 주소는 하나여야 한다. 옛 호스트(lyra-one-zeta)가 조용히 같은 사이트를
// 서빙하기 시작하면 공유 링크와 CDN 캐시가 둘로 갈린다 — next.config의 영구 이동을 지킨다.
import assert from "node:assert/strict";
const { default: config } = await import("../next.config.mjs");
assert.equal(typeof config.redirects, "function", "next.config에 redirects()가 있어야 한다");
const rules = await config.redirects();
const rule = rules.find((r) => (r.has || []).some((h) => h.type === "host" && h.value === "lyra-one-zeta.vercel.app"));
assert.ok(rule, "옛 호스트 lyra-one-zeta.vercel.app을 잡는 규칙이 있어야 한다");
assert.equal(rule.source, "/:path*", "모든 경로를 덮어야 한다");
assert.equal(rule.destination, "https://lyracyno.vercel.app/:path*", "경로를 보존한 채 운영 도메인으로 보내야 한다");
assert.equal(rule.permanent, true, "영구 이동(308)이어야 브라우저와 링크 미리보기가 새 주소를 기억한다");
console.log("✓ 운영 주소 단일화 — lyra-one-zeta → lyracyno 영구 이동");
