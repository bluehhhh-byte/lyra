import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const orbit = await readFile(new URL("../app/archive/orbit.js", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
assert.match(orbit, /className="orbit-segment"/);
assert.match(orbit, /const ORBIT_POINT_STEP_MS = 360/);
assert.match(orbit, /className="orbit-point"/);
assert.match(orbit, /i \* ORBIT_POINT_STEP_MS \+ 80/);
assert.match(css, /@keyframes orbit-draw/);
assert.match(css, /@keyframes orbit-point-reveal/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.orbit-point[\s\S]*?animation: none/);
assert.match(css, /\.orbit-point \{[\s\S]*?opacity: 1;[\s\S]*?transform: none/);
console.log("✓ 1월부터 점·이동선 순차 애니메이션·모션 감소 정지 상태");
