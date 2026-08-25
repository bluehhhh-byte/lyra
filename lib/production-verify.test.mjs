import assert from "node:assert/strict";
import { verifyProduction } from "./production-verify.js";

function successfulFetcher(deploymentId = "dpl_new") {
  return async (input) => {
    const url = new URL(input);
    if (url.pathname === "/api/version") return Response.json({ deploymentId });
    if (url.pathname === "/admin") {
      return new Response(null, { status: 307, headers: { location: "/admin/login?next=%2Fadmin" } });
    }
    if (url.pathname === "/admin/login") return new Response("<h1>관리자 로그인</h1>");
    return new Response("missing", { status: 404 });
  };
}

assert.deepEqual(
  await verifyProduction({ site: "https://lyra.example", beforeDeployment: "dpl_old", fetcher: successfulFetcher() }),
  { deploymentId: "dpl_new" }
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
  }), { deploymentId: "dpl_new" });
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
