import { createProductionDeployment, readDeployment, deployStatus } from "../../../../lib/vercel-deploy";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST() {
  try {
    return Response.json({ deployment: await createProductionDeployment() });
  } catch (e) {
    return Response.json({ error: e.message || "배포 요청 실패" }, { status: 500 });
  }
}

export async function GET(req) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    // id 없이 부르면 설정 진단 — 어떤 경로로 배포되는지, 무엇이 비어 있는지
    if (!id) return Response.json({ status: deployStatus() });
    return Response.json({ deployment: await readDeployment(id) });
  } catch (e) {
    return Response.json({ error: e.message || "배포 상태 확인 실패" }, { status: 500 });
  }
}
