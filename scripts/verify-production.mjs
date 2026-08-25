import { verifyProduction } from "../lib/production-verify.js";

const [site, beforeDeployment = ""] = process.argv.slice(2);
if (!site) {
  console.error("usage: node scripts/verify-production.mjs <site> [previous-deployment-id]");
  process.exit(2);
}

try {
  const result = await verifyProduction({ site, beforeDeployment });
  console.log(`production verification passed: ${result.deploymentId}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
