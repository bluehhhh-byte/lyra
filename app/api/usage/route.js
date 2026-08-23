import { sameOrigin, forbiddenOrigin } from "../../../lib/admin/same-origin";
import { saveBrowserUsage } from "../../../lib/usage-metrics";
import { usageMetricsEnabled } from "../../../lib/usage-metrics-core";

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
  // 계측이 꺼져 있으면 여기서 끝낸다 — 본문을 읽지도, DB를 열지도 않는다.
  // 기본값이 off이므로 평소 방문자 요청은 이 줄을 넘지 못한다.
  if (!usageMetricsEnabled()) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  if (!sameOrigin(request)) return forbiddenOrigin();
  // 인스턴스 메모리 기준이라 서버리스에서는 전역 제한이 아니다. 스팸을 늦추는
  // 완충일 뿐 보안 장치가 아니며, 실제 차단은 위의 기본 off와 same-origin이 한다.
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
