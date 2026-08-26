import { pathToFileURL } from "node:url";

export function evaluateHealth(version) {
  if (!version || typeof version !== "object") return { ok: false, message: "버전 응답이 JSON 객체가 아닙니다." };
  if (!version.sha) return { ok: false, message: "배포 SHA가 없습니다." };
  if (version.contentFallback) return { ok: false, message: `콘텐츠 저장소가 파일 폴백으로 동작 중입니다 (${version.contentStore || "unknown"}).` };
  return { ok: true, message: `정상 · ${version.sha} · ${version.contentStore || "unknown"}` };
}

export async function checkHealth(base, fetcher = fetch) {
  const url = new URL("/api/version", base).href;
  const response = await fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return { ok: false, message: `헬스체크 HTTP ${response.status}`, url };
  const version = await response.json().catch(() => null);
  return { ...evaluateHealth(version), url };
}

async function main() {
  const base = process.argv.find((arg) => /^https?:\/\//.test(arg)) || process.env.LYRA_SITE_URL || "https://lyra-one-zeta.vercel.app";
  const watch = process.argv.includes("--watch");
  const intervalArg = process.argv.find((arg) => arg.startsWith("--interval="));
  const intervalSeconds = Math.max(30, Number(intervalArg?.split("=")[1]) || 300);
  const run = async () => {
    try {
      const result = await checkHealth(base);
      console.log(`${result.ok ? "✓" : "✗"} ${new Date().toISOString()} ${result.message}`);
      if (!result.ok) process.exitCode = 1;
    } catch (error) {
      console.error(`✗ ${new Date().toISOString()} 헬스체크 연결 실패: ${error.message}`);
      process.exitCode = 1;
    }
  };
  await run();
  if (watch) setInterval(run, intervalSeconds * 1_000);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
