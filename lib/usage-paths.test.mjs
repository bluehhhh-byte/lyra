import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { normalizeBrowserUsage, USAGE_SAMPLE_WEIGHT } from "./usage-metrics-core.js";

test("usage sample retains a bounded route and cache outcome", () => {
  assert.deepEqual(normalizeBrowserUsage({ bytes: 12, path: "/archive/2026-08?q=x", cacheStatus: "MISS" }), {
    pageViews: USAGE_SAMPLE_WEIGHT,
    transferBytes: 12 * USAGE_SAMPLE_WEIGHT,
    path: "/archive/2026-08",
    cacheStatus: "MISS",
  });
  assert.equal(normalizeBrowserUsage({ bytes: 0, path: "bad", cacheStatus: "invented" }).path, "/");
  assert.equal(normalizeBrowserUsage({ bytes: 0 }).cacheStatus, "UNKNOWN");
});

test("default-off gate surrounds every path write", () => {
  const metrics = fs.readFileSync(new URL("./usage-metrics.js", import.meta.url), "utf8");
  const reporter = fs.readFileSync(new URL("../app/usage-reporter.js", import.meta.url), "utf8");
  const layout = fs.readFileSync(new URL("../app/layout.js", import.meta.url), "utf8");
  assert.match(metrics, /metricsOn \? readUsagePaths/);
  assert.match(reporter, /path: pathname, cacheStatus/);
  assert.match(layout, /usageMetricsEnabled\(\) && <UsageReporter/);
});
