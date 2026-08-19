import { createProductionDeployment, readDeployment, deployStatus, resolveHeadSha } from "../../../../lib/vercel-deploy";
import { claimDeploy, attachDeployment, finishDeploy, currentDeployJob } from "../../../../lib/deploy-jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

// 상태를 바꾸는 POST는 같은 출처에서만 받는다. 인증은 middleware의 쿠키가 하지만,
// 쿠키는 브라우저가 어디서든 실어 보낸다 — 다른 사이트에 심긴 폼 한 줄이 배포를
// 걸 수 있으면 안 된다. Origin이 없는 요청(curl 등)은 쿠키도 없으므로 통과시킨다.
function sameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

// 같은 커밋은 한 번만, 동시에 하나만. 순서가 중요하다:
//   1) GitHub main의 HEAD SHA를 먼저 확정하고
//   2) 그 SHA로 장부(claim)를 잡은 뒤
//   3) 잡힌 SHA 그대로 배포한다 — claim과 배포 사이에 main이 움직여도 어긋나지 않는다.
export async function POST(req) {
  try {
    if (!sameOrigin(req)) return Response.json({ error: "허용되지 않은 출처입니다" }, { status: 403 });

    const sha = await resolveHeadSha().catch(() => "");
    // SHA를 못 구하는 구성(Deploy Hook 전용)에서는 전역 잠금만 적용한다
    const key = sha || "hook-deploy";
    const claim = await claimDeploy(key);

    if (claim.kind === "already-deployed")
      return Response.json({ job: claim.job, alreadyDeployed: true });
    if (claim.kind === "in-progress" || claim.kind === "busy")
      return Response.json({ job: claim.job, inProgress: true });

    try {
      const deployment = await createProductionDeployment({ sha });
      if (deployment.id) await attachDeployment(key, deployment.id);
      return Response.json({ deployment, job: { ...claim.job, deploymentId: deployment.id } });
    } catch (e) {
      // 배포 생성 실패 — 장부를 닫아야 다음 시도가 잠기지 않는다
      await finishDeploy(key, { ok: false, error: e.message }).catch(() => {});
      throw e;
    }
  } catch (e) {
    return Response.json({ error: e.message || "배포 요청 실패" }, { status: 500 });
  }
}

// 운영에 실제로 반영됐는지는 Vercel의 READY만으로 판정하지 않는다. READY여도
// 별칭이 아직 안 바뀌었을 수 있다 — 지금 도메인이 서빙하는 deploymentId가 그
// 배포와 일치할 때만 완료다. 검증도 여기(폴링 GET)서 한다: 서버리스는 응답 후에
// 아무것도 실행해 주지 않으므로, 상태를 물어보는 요청이 곧 상태를 갱신할 기회다.
async function verifyLive(req, id) {
  try {
    const res = await fetch(new URL("/api/version", req.url), { cache: "no-store" });
    const v = await res.json();
    return v.deploymentId === id;
  } catch {
    return false;
  }
}

export async function GET(req) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    // id 없이 부르면 설정 진단 + 진행 중 작업 — 화면을 다시 열어도 이어서 보인다
    if (!id) return Response.json({ status: deployStatus(), job: await currentDeployJob() });

    const deployment = await readDeployment(id);
    const job = await currentDeployJob();
    const mine = job?.deploymentId === id ? job : null;

    if (mine && mine.status === "BUILDING") {
      if (deployment.state === "READY") {
        if (await verifyLive(req, id)) {
          await finishDeploy(mine.commitSha, { ok: true });
          return Response.json({ deployment: { ...deployment, state: "READY" }, job: { ...mine, status: "READY" } });
        }
        // 빌드는 끝났는데 별칭이 아직 — 클라이언트가 계속 조회하도록 중간 상태를 준다
        return Response.json({ deployment: { ...deployment, state: "VERIFYING" }, job: mine });
      }
      if (deployment.state === "ERROR" || deployment.state === "CANCELED") {
        await finishDeploy(mine.commitSha, { ok: false, error: `Vercel ${deployment.state}` });
        return Response.json({ deployment, job: { ...mine, status: "ERROR" } });
      }
    }
    return Response.json({ deployment, job: mine });
  } catch (e) {
    return Response.json({ error: e.message || "배포 상태 확인 실패" }, { status: 500 });
  }
}
