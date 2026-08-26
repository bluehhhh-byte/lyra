import assert from "node:assert/strict";
import { hasReadings, savedReadingVisibility } from "./reading-preference.js";

assert.equal(hasReadings([{ lines: [{ en: "夜", reading: "요루" }] }]), true);
assert.equal(hasReadings([{ lines: [{ en: "night" }] }]), false);
assert.equal(savedReadingVisibility(false), false);
assert.equal(savedReadingVisibility(true), true);
assert.equal(savedReadingVisibility("false"), true, "잘못 저장된 값은 기본 표시로 복구한다");
console.log("✓ 독음 존재 여부와 저장된 표시 선택을 안전하게 판정");
