import assert from "node:assert/strict";
import test from "node:test";
import { CACHE_WARNING_BYTES, cachePayloadWarning } from "./content-db.js";

test("cache payload warns only above 90 percent", () => {
  assert.equal(CACHE_WARNING_BYTES, 1_887_436.8);
  assert.equal(cachePayloadWarning(Math.floor(CACHE_WARNING_BYTES)), "");
  assert.match(cachePayloadWarning(Math.ceil(CACHE_WARNING_BYTES)), /1\.80MB.*2MB 한도/);
});

test("warning remains non-fatal beyond the hard limit", () => {
  assert.doesNotThrow(() => cachePayloadWarning(2 * 1024 * 1024 + 1));
  assert.match(cachePayloadWarning(2 * 1024 * 1024 + 1), /캐시가 통째로 무효/);
});
