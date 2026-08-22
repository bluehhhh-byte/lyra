import { getUsageDashboard } from "../../../../lib/usage-metrics";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const startedAt = Date.now();
  try {
    const dashboard = await getUsageDashboard();
    console.log(JSON.stringify({
      level: "info",
      msg: "usage dashboard",
      requestId: request.headers.get("x-vercel-id"),
      ms: Date.now() - startedAt,
    }));
    return Response.json(dashboard, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", msg: "usage dashboard failed", error: error.message, ms: Date.now() - startedAt }));
    return Response.json({ error: error.message || "사용량을 읽지 못했습니다." }, { status: 500 });
  }
}
