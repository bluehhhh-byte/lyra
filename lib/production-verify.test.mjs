import assert from "node:assert/strict";
import { verifyProduction, cachePayloadWarnings } from "./production-verify.js";

function successfulFetcher(deploymentId = "dpl_new") {
  return async (input) => {
    const url = new URL(input);
    if (url.pathname === "/api/version")
      return Response.json({ deploymentId, cachePayload: { measured: true, percent: 21.3, overLimit: false } });
    if (url.pathname === "/admin") {
      return new Response(null, { status: 307, headers: { location: "/admin/login?next=%2Fadmin" } });
    }
    if (url.pathname === "/admin/login") return new Response("<h1>관리자 로그인</h1>");
    return new Response("missing", { status: 404 });
  };
}

assert.deepEqual(
  await verifyProduction({ site: "https://lyra.example", beforeDeployment: "dpl_old", fetcher: successfulFetcher() }),
  { deploymentId: "dpl_new", warnings: [] }
);
await assert.rejects(
  () => verifyProduction({
    site: "https://lyra.example",
    beforeDeployment: "dpl_same",
    fetcher: successfulFetcher("dpl_same"),
    attempts: 2,
    wait: async () => {},
  }),
  /previous deployment/
);
{
  let versionCalls = 0;
  const baseFetcher = successfulFetcher("dpl_new");
  const delayedAliasFetcher = async (input, init) => {
    if (new URL(input).pathname === "/api/version" && versionCalls++ === 0) {
      return Response.json({ deploymentId: "dpl_old" });
    }
    return baseFetcher(input, init);
  };
  assert.deepEqual(await verifyProduction({
    site: "https://lyra.example",
    beforeDeployment: "dpl_old",
    fetcher: delayedAliasFetcher,
    attempts: 2,
    wait: async () => {},
  }), { deploymentId: "dpl_new", warnings: [] });
  assert.equal(versionCalls, 2, "이전 deployment가 보이면 새 별칭이 나타날 때까지 재시도해야 한다");
}
await assert.rejects(
  () => verifyProduction({ site: "http://lyra.example", fetcher: successfulFetcher() }),
  /HTTPS/
);
await assert.rejects(
  () => verifyProduction({ site: "https://lyra.example", fetcher: async (input) => {
    const url = new URL(input);
    return url.pathname === "/api/version" ? Response.json({ deploymentId: "dpl_new" }) : new Response("open");
  } }),
  /auth boundary/
);

console.log("production verification contract passed");

// 배포 전 크기 테스트는 songs/*.md를 DB 행의 대역으로 잰다. 백업이 뒤처지면 옛
// 크기를 보게 되므로, 배포 뒤에는 운영이 실제로 캐시한 값으로 다시 확인한다.
assert.deepEqual(cachePayloadWarnings({ measured: true, percent: 21.3, overLimit: false }), []);
assert.match(
  cachePayloadWarnings({ measured: true, percent: 61.2, overLimit: false })[0],
  /안전선 50%를 넘었으니 CONTENT_SHARDS/
);
assert.match(
  cachePayloadWarnings({ measured: true, percent: 104.5, overLimit: true })[0],
  /요청마다 Neon을 읽는다/
);
// 0바이트를 "안전"으로 읽으면 정확히 반대 결론에 도달한다.
assert.match(cachePayloadWarnings({ measured: false, percent: 0 })[0], /재지 못했다/);
assert.match(cachePayloadWarnings(undefined)[0], /옛 빌드일 수 있다/);

console.log("✓ production verify — 배포 검증과 캐시 항목 크기 경고");
