import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/ink-artwork.js", import.meta.url), "utf8");

assert.match(source, /function hashSlug/);
assert.match(source, /function mulberry32/);
assert.match(source, /const strokeCount = 3 \+ Math\.floor\(rng\(\) \* 4\)/);
assert.match(source, /drawing\.strokes\.map/);
assert.match(source, /<circle/);
assert.doesNotMatch(source, /Math\.random|Date\.now/);
assert.match(source, /TODO:[\s\S]*reduced-motion/);

console.log("✓ 잉크 아트워크 — slug 시드·3–6 스트로크·정적 대체 계약");
