import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const orbit = await readFile(new URL("../app/archive/orbit.js", import.meta.url), "utf8");
const comparison = await readFile(new URL("../app/archive/orbit-month-comparison.js", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

assert.doesNotMatch(comparison, /animation|transition|setTimeout|requestAnimationFrame|getAnimations/);
assert.doesNotMatch(comparison, /다시 재생|replay/i);
assert.doesNotMatch(orbit, /<OrbitReplayButton \/>/);
assert.doesNotMatch(css, /orbit-month-shape-reveal/);
assert.match(comparison, /onClick=\{\(\) => onChange\(point\.month\)\}/);

console.log("✓ 정서 별 그래프 — 애니메이션 없음 · 클릭형 월 비교");
