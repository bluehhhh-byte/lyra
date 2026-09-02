import { verifyProduction } from "../lib/production-verify.js";

const [site, beforeDeployment = ""] = process.argv.slice(2);
if (!site) {
  console.error("usage: node scripts/verify-production.mjs <site> [previous-deployment-id]");
  process.exit(2);
}

try {
  const result = await verifyProduction({ site, beforeDeployment });
  console.log(`production verification passed: ${result.deploymentId}`);
  // 캐시 항목 크기는 배포 성공/실패와 무관하다 — 넘겨도 사이트는 뜬다. 조용히
  // 느려지면서 Neon 전송량만 태울 뿐이라, 배포를 막는 대신 크게 알린다.
  for (const warning of result.warnings ?? []) console.warn(`⚠ ${warning}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
