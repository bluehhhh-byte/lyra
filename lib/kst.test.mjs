// KST 자정 전후에 기록일이 하루 밀리는 게 이 헬퍼가 막는 버그의 전부다.
// UTC 15:00 = KST 다음날 00:00 — 경계가 정확한지가 핵심.
//   node lib/kst.test.mjs
import assert from "node:assert/strict";
import { kstDay } from "./kst.js";

// UTC 저녁 = KST 다음날 새벽 (기존 slice(0,10)이 틀리던 케이스)
assert.equal(kstDay("2026-07-14T22:03:11.000Z"), "2026-07-15", "UTC 22시는 KST 다음날");
assert.equal(kstDay("2026-07-14T15:00:00.000Z"), "2026-07-15", "UTC 15:00 = KST 자정 경계");
assert.equal(kstDay("2026-07-14T14:59:59.000Z"), "2026-07-14", "경계 직전은 같은 날");
// UTC 오전 = KST 같은 날
assert.equal(kstDay("2026-07-14T03:00:00.000Z"), "2026-07-14", "UTC 오전은 같은 날");
console.log("✓ UTC→KST 날짜 경계");

// 날짜만 있는 값은 저장 당시의 로컬 날짜 — 시프트 없이 통과
assert.equal(kstDay("2026-07-07"), "2026-07-07", "date-only 통과");
assert.equal(kstDay(""), "", "빈 값");
assert.equal(kstDay(null), "", "null 허용");
console.log("✓ date-only·빈 값");

console.log("all passed");
