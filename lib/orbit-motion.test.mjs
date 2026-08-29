import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const orbit = await readFile(new URL("../app/archive/orbit.js", import.meta.url), "utf8");
const replay = await readFile(new URL("../app/archive/orbit-replay-button.js", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

assert.match(orbit, /const ORBIT_POINT_STEP_MS = 1200/);
assert.match(orbit, /className="orbit-month-shape"/);
assert.match(orbit, /i \* ORBIT_POINT_STEP_MS/);
assert.match(orbit, /<OrbitReplayButton \/>/);
assert.match(replay, /orbit-month-shape, \.orbit-turning-shape/);
assert.match(replay, /element\.getAnimations\(\)/);
assert.match(replay, /animation\.cancel\(\)[\s\S]*animation\.play\(\)/);
assert.match(replay, /1월부터 다시 재생/);
assert.match(css, /@keyframes orbit-month-shape-reveal/);
assert.match(css, /scale\(0\.38\) rotate\(-18deg\)/);
assert.match(css, /orbit-month-shape-reveal 1\.05s/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.orbit-month-shape[\s\S]*?animation: none/);
assert.match(css, /\.orbit-month-shape \{[\s\S]*?opacity: var\(--orbit-shape-opacity/);

console.log("✓ 큰 별 월별 변화·잔상·다시 재생·모션 감소 정지 상태");
