// lib/cache-size.test.mjs와 같은 안전선. 그 테스트는 songs/*.md를 DB 행의 대역으로
// 재므로 백업이 뒤처지면 옛 크기를 본다. 여기서는 운영이 실제로 캐시한 값을 읽는다.
const CACHE_SAFE_PERCENT = 50;

export function cachePayloadWarnings(payload) {
  if (!payload) return ["운영이 cachePayload를 보고하지 않는다 — /api/version이 옛 빌드일 수 있다."];
  if (!payload.measured)
    return ["운영이 캐시 항목 크기를 재지 못했다(measured:false) — 잠시 뒤 /api/version을 다시 확인하라."];
  if (payload.overLimit)
    return [`캐시 항목이 2MiB 한도를 넘었다(${payload.percent}%). 저장이 조용히 건너뛰어져 요청마다 Neon을 읽는다 — CONTENT_SHARDS를 올려라.`];
  if (payload.percent >= CACHE_SAFE_PERCENT)
    return [`캐시 항목이 한도의 ${payload.percent}%다. 안전선 ${CACHE_SAFE_PERCENT}%를 넘었으니 CONTENT_SHARDS를 올려라 — TTL을 줄이는 것은 답이 아니다.`];
  return [];
}

function assertResponse(response, message) {
  if (!response.ok) throw new Error(`${message}: HTTP ${response.status}`);
}

export async function verifyProduction({
  site,
  beforeDeployment = "",
  fetcher = fetch,
  attempts = 6,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const base = new URL(site);
  if (base.protocol !== "https:") throw new Error("Production site must use HTTPS");
  base.pathname = "/";
  base.search = "";

  let version;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const versionUrl = new URL("api/version", base);
    versionUrl.searchParams.set("verify", `${Date.now()}-${attempt}`);
    const versionResponse = await fetcher(versionUrl, {
      headers: { "cache-control": "no-cache" },
      cache: "no-store",
    });
    assertResponse(versionResponse, "Production version check failed");
    version = await versionResponse.json();
    if (!version?.deploymentId) throw new Error("Production did not return a deployment ID");
    if (!beforeDeployment || version.deploymentId !== beforeDeployment) break;
    if (attempt < attempts - 1) await wait(1000 * (attempt + 1));
  }
  if (beforeDeployment && version.deploymentId === beforeDeployment) {
    throw new Error(`Production alias still points to the previous deployment after ${attempts} checks: ${beforeDeployment}`);
  }

  const adminResponse = await fetcher(new URL("admin", base), {
    redirect: "manual",
    cache: "no-store",
  });
  const location = adminResponse.headers.get("location");
  const loginUrl = location ? new URL(location, base) : null;
  if (![307, 308].includes(adminResponse.status) || loginUrl?.pathname !== "/admin/login") {
    throw new Error(`Admin auth boundary failed: HTTP ${adminResponse.status}`);
  }

  const loginResponse = await fetcher(new URL("admin/login", base), { cache: "no-store" });
  assertResponse(loginResponse, "Admin login page check failed");
  const loginBody = await loginResponse.text();
  if (!loginBody.includes("관리자 로그인")) throw new Error("Admin login page body is missing");

  return { deploymentId: version.deploymentId, warnings: cachePayloadWarnings(version.cachePayload) };
}
