import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { usageLimits } from "./usage-metrics-core.js";

test("Neon limits come only from deployment configuration", () => {
  assert.equal(usageLimits({}).neonTransferBytes, null);
  assert.equal(usageLimits({ NEON_TRANSFER_LIMIT_BYTES: "5000000000" }).neonTransferBytes, 5_000_000_000);
  assert.equal(usageLimits({ NEON_TRANSFER_LIMIT_BYTES: "invalid" }).neonTransferBytes, null);
});

test("dashboard displays provider usage even without a hardcoded plan allowance", () => {
  const metrics = fs.readFileSync(new URL("./usage-metrics.js", import.meta.url), "utf8");
  const dashboard = fs.readFileSync(new URL("../app/admin/usage/usage-dashboard.js", import.meta.url), "utf8");
  assert.match(metrics, /body\.project\?\.data_transfer_bytes/);
  assert.match(metrics, /limits = usageLimits\(\)/);
  assert.doesNotMatch(metrics, /5_000_000_000|5000000000/);
  assert.match(dashboard, /공급자 사용량만 표시 중/);
});
