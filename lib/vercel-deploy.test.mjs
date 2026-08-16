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

await assert.rejects(
  () =>
    createProductionDeployment({
      env,
      fetcher: async () => Response.json({ error: { message: "Not authorized", invalidToken: true } }, { status: 403 }),
    }),
  /토큰이 만료/
);

console.log("all passed");
