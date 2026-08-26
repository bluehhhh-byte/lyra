import assert from "node:assert/strict";
import {
  bytesOf,
  estimateUploadCapacity,
  normalizeBrowserUsage,
  usageLimits,
  usageStatus,
  usagePercent,
  USAGE_SAMPLE_WEIGHT,
} from "./usage-metrics-core.js";

assert.equal(normalizeBrowserUsage({ bytes: -1 }), null);
assert.equal(normalizeBrowserUsage({ bytes: "oops" }), null);
assert.deepEqual(normalizeBrowserUsage({ bytes: 1200 }), {
  pageViews: USAGE_SAMPLE_WEIGHT,
  transferBytes: 1200 * USAGE_SAMPLE_WEIGHT,
  path: "/",
  cacheStatus: "UNKNOWN",
});
assert.equal(bytesOf({ text: "가" }), Buffer.byteLength(JSON.stringify({ text: "가" })));
assert.equal(usagePercent(2.5, 5), 50);
assert.equal(usagePercent(10, 5), 100);
assert.equal(usagePercent(-1, 5), 0);
assert.deepEqual(estimateUploadCapacity({
  contentBytes: 1_000,
  contentRows: 0,
  transferUsed: 2_000,
  transferLimit: 10_000,
}), {
  uploadBytes: 1_050,
  safetyRatio: 0.8,
  totalUploads: 7,
  remainingUploads: 5,
});
assert.equal(estimateUploadCapacity({ contentBytes: 1_000, contentRows: 0, transferUsed: 0 }).remainingUploads, null);
assert.deepEqual(usageLimits({ NEON_TRANSFER_LIMIT_BYTES: "123", NEON_STORAGE_LIMIT_BYTES: "456" }), {
  vercelTransferBytes: null,
  neonTransferBytes: 123,
  neonStorageBytes: 456,
});
assert.equal(usageStatus([2, 49]).label, "안정");
assert.equal(usageStatus([50]).label, "관찰");
assert.equal(usageStatus([72]).label, "주의");
assert.equal(usageStatus([91]).label, "위험");

console.log("usage metrics core ok");
