import { sameOrigin, forbiddenOrigin } from "../../../lib/admin/same-origin";
import { saveBrowserUsage } from "../../../lib/usage-metrics";

export const dynamic = "force-dynamic";

const beaconWindows = new Map();
function allowBeacon(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const minute = Math.floor(Date.now() / 60_000);
  const current = beaconWindows.get(ip);
  if (!current || current.minute !== minute) {
    beaconWindows.set(ip, { minute, count: 1 });
    if (beaconWindows.size > 2_000)
      for (const [key, value] of beaconWindows) if (value.minute < minute) beaconWindows.delete(key);
    return true;
  }
  current.count += 1;
  return current.count <= 12;
}

export async function POST(request) {
  const startedAt = Date.now();
  if (!sameOrigin(request)) return forbiddenOrigin();
  if (!allowBeacon(request)) return new Response(null, { status: 204 });
  try {
    const saved = await saveBrowserUsage(await request.json());
    console.log(JSON.stringify({ level: "info", msg: "usage beacon", saved, ms: Date.now() - startedAt }));
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", msg: "usage beacon failed", error: error.message, ms: Date.now() - startedAt }));
    // 계측 실패가 방문자의 화면에 영향을 주지 않게 한다.
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
}
