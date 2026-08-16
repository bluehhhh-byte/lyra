import assert from "node:assert/strict";
import { createProductionDeployment, readDeployment } from "./vercel-deploy.js";

const env = {
  LYRA_VERCEL_TOKEN: "secret-token",
  LYRA_VERCEL_TEAM_ID: "team_123",
  LYRA_VERCEL_PROJECT_ID: "prj_123",
  GITHUB_REPO: "bluehhhh-byte/lyra",
  GITHUB_BRANCH: "main",
};

let request;
const fetcher = async (url, init) => {
  request = { url, init };
  return Response.json({
    id: "dpl_abc123",
    url: "lyra-new.vercel.app",
    readyState: "INITIALIZING",
    meta: { githubCommitSha: "abcdef123456" },
  });
};

const created = await createProductionDeployment({ env, fetcher });
assert.equal(created.id, "dpl_abc123");
assert.equal(created.url, "https://lyra-new.vercel.app");
assert.equal(created.state, "INITIALIZING");
assert.equal(request.url, "https://api.vercel.com/v13/deployments?teamId=team_123");
assert.equal(request.init.headers.Authorization, "Bearer secret-token");
assert.deepEqual(JSON.parse(request.init.body), {
  name: "lyra",
  project: "prj_123",
  target: "production",
  gitSource: { type: "github", org: "bluehhhh-byte", repo: "lyra", ref: "main" },
});

const hooked = await createProductionDeployment({
  env: { VERCEL_DEPLOY_HOOK: "https://api.vercel.com/v1/integrations/deploy/prj_123/hook_abc" },
  fetcher: async (url, init) => {
    request = { url, init };
    return Response.json({ job: { id: "job_123" } });
  },
});
assert.equal(request.url, "https://api.vercel.com/v1/integrations/deploy/prj_123/hook_abc");
assert.equal(request.init.method, "POST");
assert.deepEqual(hooked, {
  id: "job_123",
  url: "",
  state: "TRIGGERED",
  commitSha: "",
  commitMessage: "",
  pollable: false,
});

await assert.rejects(
  () => createProductionDeployment({ env: { VERCEL_DEPLOY_HOOK: "https://example.com/deploy" }, fetcher }),
  /주소가 올바르지/
);

await readDeployment("dpl_abc123", { env, fetcher });
assert.equal(request.url, "https://api.vercel.com/v13/deployments/dpl_abc123?teamId=team_123");

await assert.rejects(
  () => createProductionDeployment({ env: { ...env, LYRA_VERCEL_TOKEN: "" }, fetcher }),
  /LYRA_VERCEL_TOKEN/
);
await assert.rejects(() => readDeployment("../wrong", { env, fetcher }), /잘못된 배포 ID/);

await assert.rejects(
  () =>
    createProductionDeployment({
      env,
      fetcher: async () => Response.json({ error: { message: "repository unavailable" } }, { status: 400 }),
    }),
  /repository unavailable/
);

// 토큰이 거부되는 모든 경우 — 화면에 "Not authorized"만 뜨면 무엇을 해야 할지 알 수 없다.
// 어느 경로로 막히든 Deploy Hook을 만들라는 같은 해결책이 나와야 한다.
for (const [status, payload] of [
  [401, { error: { message: "Not authorized" } }],
  [403, { error: { message: "Not authorized", invalidToken: true } }],
  [403, { error: { message: "Forbidden" } }],
]) {
  await assert.rejects(
    () => createProductionDeployment({ env, fetcher: async () => Response.json(payload, { status }) }),
    (e) => {
      assert.match(e.message, /토큰이 거부됐습니다/);
      assert.match(e.message, /Deploy Hooks/, "무엇을 해야 하는지 알려주지 않는다");
      assert.match(e.message, /VERCEL_DEPLOY_HOOK/);
      return true;
    },
    `${status} ${payload.error.message}`
  );
}

// 환경변수가 아예 없을 때도 "무엇이 없다"로 끝내지 않고 할 일을 알려준다
await assert.rejects(
  () => createProductionDeployment({ env: {}, fetcher }),
  (e) => {
    assert.match(e.message, /Deploy Hooks/);
    assert.match(e.message, /LYRA_VERCEL_TOKEN/, "빠진 값도 함께 밝힌다");
    return true;
  }
);

console.log("all passed");
