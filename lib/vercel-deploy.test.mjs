import assert from "node:assert/strict";
import fs from "node:fs";
import { createProductionDeployment, readDeployment, deployStatus, productionMatches } from "./vercel-deploy.js";

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

// Deploy Hook 경로는 제거됐다 — 진행 조회가 안 되고 job id가 deployment id처럼
// 저장돼 장부가 READY로 닫히지 못했다. 훅이 설정돼 있어도 무시하고 source로 간다.
deployRequest = null;
await createProductionDeployment({
  env: { ...env, VERCEL_DEPLOY_HOOK: "https://api.vercel.com/v1/integrations/deploy/prj_123/hook_abc" },
  fetcher, deployer, sourceProvider,
});
assert.ok(deployRequest, "훅이 있어도 source 배포가 실행된다");

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

// 설정 진단 — 무엇이 비었는지 화면에서 확인할 수 있어야 한다. 값은 내보내지 않는다.
{
  const s2 = deployStatus({ env });
  assert.equal(s2.mode, "source");
  assert.equal(s2.hint, "", "설정이 갖춰졌으면 안내가 필요 없다");
  assert.ok(!JSON.stringify(s2).includes("secret-token"), "토큰 값이 새어 나간다");

  const s3 = deployStatus({ env: {} });
  assert.equal(s3.mode, "none");
  assert.ok(s3.tokenMissing.includes("LYRA_VERCEL_TOKEN"));
  assert.match(s3.hint, /모바일 배포/);
}

// 운영 반영 판정 — deploymentId는 항상, SHA는 40자리일 때만 함께 본다.
{
  const sha = "c".repeat(40);
  const ok = productionMatches({ deploymentId: "dpl_1", sha }, { deploymentId: "dpl_1", commitSha: sha });
  assert.equal(ok.ok, true);

  const wrongDpl = productionMatches({ deploymentId: "dpl_2", sha }, { deploymentId: "dpl_1", commitSha: sha });
  assert.equal(wrongDpl.ok, false);
  assert.match(wrongDpl.reason, /deployment 불일치/);

  const wrongSha = productionMatches({ deploymentId: "dpl_1", sha: "dev" }, { deploymentId: "dpl_1", commitSha: sha });
  assert.equal(wrongSha.ok, false);
  assert.match(wrongSha.reason, /커밋 불일치/);
  assert.ok(!wrongSha.reason.includes(sha), "SHA 전체를 흘리지 않는다 — 앞 7자리만");
  assert.ok(wrongSha.reason.includes(sha.slice(0, 7)));

  // 장부에 온전한 SHA가 없는 행(과거 배포) — deploymentId 일치만으로 인정하는
  // 명시적 fallback. 이유는 productionMatches 주석에 있다.
  const noSha = productionMatches({ deploymentId: "dpl_1", sha: "dev" }, { deploymentId: "dpl_1", commitSha: "" });
  assert.equal(noSha.ok, true);
}

const productionScript = fs.readFileSync(new URL("../scripts/deploy-production.ps1", import.meta.url), "utf8");
assert.match(productionScript, /wait-for-production\.mjs/, "Git 연동 배포 완료를 기다려야 한다");
assert.match(productionScript, /Global\\LyraProductionDeploy/, "동시에 두 배포가 시작되면 안 된다");
assert.match(productionScript, /\$liveSha -eq \$targetSha/, "운영 중인 같은 커밋은 다시 배포하면 안 된다");
assert.match(productionScript, /continuing to production verification/, "CLI 종료 오류는 운영 검증으로 판정해야 한다");
assert.match(productionScript, /RunNodeVerification/, "운영 검증의 일시적인 node 종료 오류는 재시도해야 한다");
assert.equal((productionScript.match(/vercel@59\.1\.3.*"deploy"/g) || []).length, 1, "CLI 배포 경로는 하나뿐이어야 한다");

// Windows + Node 25에서 fetch 뒤에 process.exit()를 부르면 libuv가 죽는다
// (0xC0000409). 성공해도 죽어서 5/5 검증 단계가 늘 실패했고, wait 뒤에 오는
// verify-production.mjs는 실행조차 되지 않았다. 인자 검사는 fetch 전이라 예외다.
for (const name of ["wait-for-production", "verify-production"]) {
  const script = fs.readFileSync(new URL(`../scripts/${name}.mjs`, import.meta.url), "utf8");
  const calls = script.match(/process\.exit\(\d\)/g) || [];
  assert.deepEqual(calls, ["process.exit(2)"], `${name}.mjs는 fetch 뒤에 process.exit()를 부르면 안 된다`);
  assert.match(script, /process\.exitCode = 1/, `${name}.mjs는 실패를 exitCode로 알려야 한다`);
}

console.log("vercel deployment script contract ok");
