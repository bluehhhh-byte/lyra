const [site, expectedSha, timeoutArg = "720000"] = process.argv.slice(2);
if (!site || !/^[0-9a-f]{40}$/i.test(expectedSha || "")) {
  console.error("usage: node scripts/wait-for-production.mjs <site> <40-char-sha> [timeout-ms]");
  process.exit(2);
}

const deadline = Date.now() + Math.max(30_000, Number(timeoutArg) || 720_000);
let last = {};
while (Date.now() < deadline) {
  try {
    const response = await fetch(`${site.replace(/\/$/, "")}/api/version?t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (response.ok) {
      last = await response.json();
      if (last.sha === expectedSha) {
        console.log(`Git-integrated production ready: ${String(last.deploymentId || "unknown")}`);
        process.exit(0);
      }
    }
  } catch (error) {
    last = { error: error instanceof Error ? error.message : String(error) };
  }
  console.log(`waiting for ${expectedSha.slice(0, 7)} (live ${String(last.sha || last.error || "unknown").slice(0, 40)})`);
  await new Promise((resolve) => setTimeout(resolve, 15_000));
}
console.error(`Git-integrated deployment timed out; expected ${expectedSha.slice(0, 7)}, live ${String(last.sha || "unknown").slice(0, 7)}`);
process.exit(1);
