import {
  createProductionDeployment,
  readDeployment,
  deployStatus,
  resolveHeadSha,
  productionMatches,
} from "../../../../lib/vercel-deploy";
import {
  claimDeploy,
  attachDeployment,
  finishDeploy,
  currentDeployJob,
  deployStatusSnapshot,
  deploymentStatusSummary,
  renewDeployLease,
} from "../../../../lib/deploy-jobs";
import { sameOrigin, forbiddenOrigin } from "../../../../lib/admin/same-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

// 같은 커밋은 한 번만, 동시에 하나만. 순서가 중요하다:
//   1) GitHub main의 HEAD SHA를 먼저 확정하고
//   2) 그 SHA로 장부(claim)를 잡은 뒤
//   3) 잡힌 SHA 그대로 배포한다 — claim과 배포 사이에 main이 움직여도 어긋나지 않는다.
export async function POST(req) {
  try {
    if (!sameOrigin(req)) return forbiddenOrigin();

    const sha = await resolveHeadSha();
    const claim = await claimDeploy(sha);

    if (claim.kind === "already-deployed")
      return Response.json({ job: claim.job, alreadyDeployed: true });
    if (claim.kind === "in-progress" || claim.kind === "busy")
      return Response.json({ job: claim.job, inProgress: true });

    try {
      const deployment = await createProductionDeployment({ sha });
      if (deployment.id) await attachDeployment(sha, deployment.id);
      return Response.json({ deployment, job: { ...claim.job, deploymentId: deployment.id } });
    } catch (e) {
      // 배포 생성 실패 — 장부를 닫아야 다음 시도가 잠기지 않는다
      await finishDeploy(sha, { ok: false, error: e.message }).catch(() => {});
      throw e;
    }
  } catch (e) {
    return Response.json({ error: e.message || "배포 요청 실패" }, { status: 500 });
  }
}

// 빌드가 진행 중인 Vercel 상태 — 이 동안은 lease를 밀어 준다(heartbeat).
// READY는 여기 없다: READY 뒤의 검증(VERIFYING)에는 lease를 밀지 않는다.
// 밀면 별칭이 영영 안 바뀌는 불일치 상태가 무한히 살아남는다. 마지막 BUILDING
// heartbeat + 10분이 곧 검증 시한이고, 그 뒤 sweep이 ERROR로 종결한다.
const IN_FLIGHT = new Set(["QUEUED", "INITIALIZING", "BUILDING"]);

// 운영 반영 확인 — Vercel READY만으로 성공 처리하지 않는다. 지금 도메인이 서빙하는
// deploymentId(그리고 장부에 SHA가 있으면 커밋까지)가 일치할 때만 완료다.
async function liveVersion(req) {
  try {
    const res = await fetch(new URL("/api/version", req.url), { cache: "no-store" });
    return await res.json();
  } catch {
    return null;
  }
}

export async function GET(req) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    // id 없이 부르면 설정 진단 + 진행 중 작업 — 화면을 다시 열어도 이어서 보인다.
    // currentDeployJob이 만료 BUILDING을 정리하므로 여기 상태는 언제나 현재형이다.
    if (!id) {
      const status = deployStatus();
      const snapshot = await deployStatusSnapshot();
      let sourceSha = "";
      let version = null;
      if (status.mode === "source") {
        [sourceSha, version] = await Promise.all([
          resolveHeadSha().catch(() => ""),
          liveVersion(req),
        ]);
      }
      return Response.json({
        status,
        job: snapshot.current,
        deploymentStatus: deploymentStatusSummary({ sourceSha, liveVersion: version, lastReady: snapshot.lastReady }),
      });
    }

    const deployment = await readDeployment(id);
    const job = await currentDeployJob();
    const mine = job?.deploymentId === id ? job : null;

    if (mine && mine.status === "BUILDING") {
      if (IN_FLIGHT.has(deployment.state)) {
        // heartbeat — 빌드가 10분을 넘어도, 지켜보는 폴링이 있는 한 잠금은 산다
        await renewDeployLease(mine.commitSha, id);
      } else if (deployment.state === "READY") {
        const match = productionMatches(await liveVersion(req), {
          deploymentId: id,
          commitSha: mine.commitSha,
        });
        if (match.ok) {
          await finishDeploy(mine.commitSha, { ok: true });
          return Response.json({ deployment, job: { ...mine, status: "READY" } });
        }
        // 별칭이 아직 안 바뀐 정상 과도기일 수 있어 바로 실패로 접지 않는다.
        // 진짜 불일치라면 lease가 더 갱신되지 않으므로 10분 뒤 sweep이 ERROR로 닫는다.
        return Response.json({
          deployment: { ...deployment, state: "VERIFYING", note: match.reason },
          job: mine,
        });
      } else if (deployment.state === "ERROR" || deployment.state === "CANCELED") {
        await finishDeploy(mine.commitSha, { ok: false, error: `Vercel ${deployment.state}` });
        return Response.json({ deployment, job: { ...mine, status: "ERROR", error: `Vercel ${deployment.state}` } });
      }
    }
    return Response.json({ deployment, job: mine });
  } catch (e) {
    return Response.json({ error: e.message || "배포 상태 확인 실패" }, { status: 500 });
  }
}
