import assert from "node:assert/strict";
import fs from "node:fs";
import { deploymentStatusSummary } from "./deploy-jobs.js";

const source = "a".repeat(40);
const deployed = "b".repeat(40);
const ready = {
  commitSha: deployed,
  deploymentId: "dpl_ready",
  updatedAt: "2026-08-27T01:02:03.000Z",
};

assert.deepEqual(deploymentStatusSummary({ sourceSha: source, liveVersion: { sha: source, deploymentId: "dpl_current" }, lastReady: ready }), {
  sourceSha: source,
  deployedSha: source,
  matches: true,
  lastDeployedAt: ready.updatedAt,
  deploymentId: "dpl_current",
});
assert.equal(deploymentStatusSummary({ sourceSha: source, liveVersion: { sha: deployed }, lastReady: ready }).matches, false);
assert.equal(deploymentStatusSummary({ sourceSha: source, liveVersion: null, lastReady: ready }).matches, null);
assert.equal(deploymentStatusSummary({ sourceSha: source, liveVersion: { deploymentId: ready.deploymentId }, lastReady: ready }).deployedSha, deployed);

const control = fs.readFileSync(new URL("../app/admin/deploy-control.js", import.meta.url), "utf8");
assert.match(control, /마지막 배포/);
assert.match(control, /현재 코드와 운영 배포가 같습니다/);
assert.match(control, /미배포 변경이 있습니다/);

console.log("관리자 배포 상태 표시 검증 통과");
