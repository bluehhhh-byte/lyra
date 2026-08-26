import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const orbit = await readFile(new URL("../app/archive/orbit.js", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
assert.match(orbit, /className="orbit-segment"/);
assert.match(orbit, /animationDelay: `\$\{i \* 110\}ms`/);
assert.match(css, /@keyframes orbit-draw/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.orbit-segment[\s\S]*?animation: none/);
console.log("✓ 궤도 순차 애니메이션·모션 감소 정지 상태");
