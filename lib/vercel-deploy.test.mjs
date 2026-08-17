import assert from "node:assert/strict";
import { createProductionDeployment, readDeployment, deployStatus } from "./vercel-deploy.js";

const env = {
  LYRA_VERCEL_TOKEN: "secret-token",
  LYRA_VERCEL_TEAM_ID: "team_123",
  LYRA_VERCEL_PROJECT_ID: "prj_123",
  GITHUB_TOKEN: "github-token",
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

let deployRequest;
const sourceProvider = async () => ({
  sourceDir: "/tmp/source",
  commit: {
    sha: "a".repeat(40),
    message: "latest song",
    authorName: "Lyra",
    authorEmail: "lyra@example.com",
  },
});
async function deployer(options) {
  deployRequest = options;
  return {
    id: "dpl_abc123",
    url: "lyra-new.vercel.app",
    readyState: "INITIALIZING",
    meta: { githubCommitSha: "abcdef123456" },
  };
}

const created = await createProductionDeployment({ env, fetcher, deployer, sourceProvider });
assert.equal(created.id, "dpl_abc123");
assert.equal(created.url, "https://lyra-new.vercel.app");
assert.equal(created.state, "INITIALIZING");
assert.equal(deployRequest.cfg.token, "secret-token");
assert.equal(deployRequest.cfg.teamId, "team_123");
assert.equal(deployRequest.sourceDir, "/tmp/source");
assert.equal(deployRequest.commit.sha, "a".repeat(40));

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

// 환경변수가 아예 없을 때도 "무엇이 없다"로 끝내지 않고 할 일을 알려준다
await assert.rejects(
  () => createProductionDeployment({ env: {}, fetcher }),
  (e) => {
    assert.match(e.message, /모바일 배포/);
    assert.match(e.message, /LYRA_VERCEL_TOKEN/, "빠진 값도 함께 밝힌다");
    return true;
  }
);

// 설정 진단 — 훅을 넣고 재배포까지 했는지 화면에서 확인할 수 있어야 한다.
// 값 자체(훅 주소)는 배포를 걸 수 있는 비밀이라 절대 내보내지 않는다.
{
  const hookEnv = { VERCEL_DEPLOY_HOOK: "https://api.vercel.com/v1/integrations/deploy/prj_1/abc" };
  const s1 = deployStatus({ env: hookEnv });
  assert.equal(s1.mode, "hook");
  assert.equal(s1.hook, "ok");
  assert.equal(s1.hint, "", "훅이 있으면 안내가 필요 없다");
  assert.ok(!JSON.stringify(s1).includes("abc"), "훅 주소가 새어 나간다");

  // 프로젝트 토큰과 GitHub 토큰이 있으면 서버에서 소스를 직접 올린다
  const s2 = deployStatus({ env });
  assert.equal(s2.mode, "source");
  assert.equal(s2.hook, "none");
  assert.match(s2.hint, /모바일 배포/);

  // 아무것도 없음
  const s3 = deployStatus({ env: {} });
  assert.equal(s3.mode, "none");
  assert.ok(s3.tokenMissing.includes("LYRA_VERCEL_TOKEN"));

  // 훅 주소를 잘못 넣은 경우 — 조용히 토큰으로 넘어가면 원인을 못 찾는다
  const s4 = deployStatus({ env: { VERCEL_DEPLOY_HOOK: "https://example.com/deploy" } });
  assert.equal(s4.hook, "invalid");
  assert.equal(s4.mode, "none");
}

console.log("all passed");
