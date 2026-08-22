import assert from "node:assert/strict";
import {
  bytesOf,
  normalizeBrowserUsage,
  usagePercent,
  USAGE_SAMPLE_WEIGHT,
} from "./usage-metrics-core.js";

assert.equal(normalizeBrowserUsage({ bytes: -1 }), null);
assert.equal(normalizeBrowserUsage({ bytes: "oops" }), null);
assert.deepEqual(normalizeBrowserUsage({ bytes: 1200 }), {
  pageViews: USAGE_SAMPLE_WEIGHT,
  transferBytes: 1200 * USAGE_SAMPLE_WEIGHT,
});
assert.equal(bytesOf({ text: "가" }), Buffer.byteLength(JSON.stringify({ text: "가" })));
assert.equal(usagePercent(2.5, 5), 50);
assert.equal(usagePercent(10, 5), 100);
assert.equal(usagePercent(-1, 5), 0);

console.log("usage metrics core ok");
