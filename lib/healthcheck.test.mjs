import assert from "node:assert/strict";
import test from "node:test";
import { checkHealth, evaluateHealth } from "../scripts/healthcheck.mjs";

test("health evaluation rejects content fallback", () => {
  assert.equal(evaluateHealth({ sha: "abc", contentStore: "neon", contentFallback: false }).ok, true);
  assert.match(evaluateHealth({ sha: "abc", contentStore: "neon", contentFallback: true }).message, /파일 폴백/);
  assert.equal(evaluateHealth({ contentFallback: false }).ok, false);
});

test("healthcheck calls only the existing version endpoint", async () => {
  let requested = "";
  const result = await checkHealth("https://example.test/admin", async (url) => {
    requested = url;
    return { ok: true, json: async () => ({ sha: "abc", contentStore: "neon", contentFallback: false }) };
  });
  assert.equal(requested, "https://example.test/api/version");
  assert.equal(result.ok, true);
});
