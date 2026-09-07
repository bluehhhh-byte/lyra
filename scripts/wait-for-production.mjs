// 배포한 커밋이 운영에 뜰 때까지 기다린다.
//
// 여기서 process.exit()를 부르면 안 된다. Windows + Node 25에서 fetch(undici)의
// keep-alive 소켓이 정리되는 중에 이벤트 루프를 강제로 끊으면 libuv가 죽는다
// (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`, 종료 코드
// 0xC0000409). 성공해도 죽기 때문에 배포 스크립트의 5/5 단계가 늘 실패했고,
// 그 뒤에 오는 verify-production.mjs는 실행조차 되지 않았다.
// exitCode만 세우고 루프가 알아서 끝나게 둔다.
const [site, expectedSha, timeoutArg = "720000"] = process.argv.slice(2);
if (!site || !/^[0-9a-f]{40}$/i.test(expectedSha || "")) {
  console.error("usage: node scripts/wait-for-production.mjs <site> <40-char-sha> [timeout-ms]");
  // 아직 fetch를 하기 전이라 즉시 종료해도 안전하다.
  process.exit(2);
}

const deadline = Date.now() + Math.max(30_000, Number(timeoutArg) || 720_000);
let last = {};
let ready = false;
while (!ready && Date.now() < deadline) {
  try {
    const response = await fetch(`${site.replace(/\/$/, "")}/api/version?t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (response.ok) {
      last = await response.json();
      if (last.sha === expectedSha) {
        console.log(`Git-integrated production ready: ${String(last.deploymentId || "unknown")}`);
        ready = true;
        break;
      }
    }
  } catch (error) {
    last = { error: error instanceof Error ? error.message : String(error) };
  }
  console.log(`waiting for ${expectedSha.slice(0, 7)} (live ${String(last.sha || last.error || "unknown").slice(0, 40)})`);
  await new Promise((resolve) => setTimeout(resolve, 15_000));
}
if (!ready) {
  console.error(`Git-integrated deployment timed out; expected ${expectedSha.slice(0, 7)}, live ${String(last.sha || "unknown").slice(0, 7)}`);
  process.exitCode = 1;
}
