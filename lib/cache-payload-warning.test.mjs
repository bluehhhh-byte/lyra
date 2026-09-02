import assert from "node:assert/strict";
import test from "node:test";
import { CACHE_WARNING_BYTES, cachePayloadWarning, cachePayloadPeak, packedThroughCache, packRows, unpackRows } from "./content-db.js";

const LIMIT = 2 * 1024 * 1024;

test("cache payload warns only above 90 percent", () => {
  assert.equal(CACHE_WARNING_BYTES, 1_887_436.8);
  assert.equal(cachePayloadWarning(Math.floor(CACHE_WARNING_BYTES)), "");
  assert.match(cachePayloadWarning(Math.ceil(CACHE_WARNING_BYTES)), /1\.80MB.*2MB 한도/);
});

test("warning remains non-fatal beyond the hard limit", () => {
  assert.doesNotThrow(() => cachePayloadWarning(2 * 1024 * 1024 + 1));
  assert.match(cachePayloadWarning(2 * 1024 * 1024 + 1), /캐시가 통째로 무효/);
});

// /api/version이 이 값을 그대로 내보낸다. 0바이트를 "안전"으로 읽으면 정확히
// 반대 결론에 도달하므로, 재본 적 없음과 안전함은 다른 필드로 구분한다.
test("cachePayloadPeak separates unmeasured from safe", () => {
  assert.deepEqual(cachePayloadPeak(0), {
    measured: false, bytes: 0, limit: LIMIT, percent: 0, nearLimit: false, overLimit: false,
  });
  const half = cachePayloadPeak(LIMIT / 2);
  assert.equal(half.measured, true);
  assert.equal(half.percent, 50);
  assert.equal(half.nearLimit, false);
  assert.equal(cachePayloadPeak(LIMIT * 0.95).nearLimit, true);
  assert.equal(cachePayloadPeak(LIMIT * 0.95).overLimit, false);
  assert.equal(cachePayloadPeak(LIMIT + 1).overLimit, true);
});

test("packRows records the largest payload it has produced", () => {
  const before = cachePayloadPeak().bytes;
  packRows([{ slug: "peak-probe", raw: "x".repeat(400_000), revision: 1 }]);
  assert.ok(cachePayloadPeak().bytes >= before, "관측한 최대치는 줄어들지 않는다");
  assert.equal(cachePayloadPeak().measured, true);
});

// 정상 운영에서는 캐시 적중이 대부분이라 packRows가 돌지 않는다. 꺼내는 쪽에서
// 재지 않으면 크기를 아는 인스턴스가 사실상 없고 measured는 늘 false가 된다.
test("unpackRows measures on cache hits too", () => {
  const packed = packRows([{ slug: "hit-probe", raw: "y".repeat(900_000), revision: 1 }]);
  const peakAfterPack = cachePayloadPeak().bytes;
  assert.ok(peakAfterPack >= packed.length);
  const rows = unpackRows(packed);
  assert.equal(rows[0].slug, "hit-probe");
  assert.ok(cachePayloadPeak().bytes >= packed.length, "적중 경로도 같은 크기를 봐야 한다");
});

// 한도를 넘긴 항목은 Data Cache가 조용히 버린다. 그때 매 요청 DB로 내려가지
// 않도록 프로세스 안에서 한 번만 읽는지 — 이게 전송 한도를 태우느냐 마느냐다.
test("oversized payloads are served from the in-process net", async () => {
  const oversized = "z".repeat(LIMIT + 1024);
  let calls = 0;
  const entry = async () => { calls += 1; return oversized; };
  assert.equal(await packedThroughCache("test:oversized", entry), oversized);
  assert.equal(calls, 1);
  await packedThroughCache("test:oversized", entry);
  await packedThroughCache("test:oversized", entry);
  assert.equal(calls, 1, "한도를 넘긴 항목은 인스턴스당 한 번만 읽어야 한다");
});

// 정상 크기는 Data Cache가 맡는다. 여기서까지 들고 있으면 태그 무효화를 못 듣는
// 사본이 생겨 저장 직후 옛 값이 보인다.
test("normal payloads are not held in the in-process net", async () => {
  let calls = 0;
  const entry = async () => { calls += 1; return "small"; };
  await packedThroughCache("test:small", entry);
  await packedThroughCache("test:small", entry);
  assert.equal(calls, 2, "한도 이내 항목은 매번 Data Cache 경로를 그대로 통과해야 한다");
});
