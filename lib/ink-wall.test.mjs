import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const wall = await readFile(new URL("../app/ink-wall.js", import.meta.url), "utf8");
const player = await readFile(new URL("../app/player.js", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/layout.js", import.meta.url), "utf8");

assert.match(wall, /tapAudio\(audio, \{ fftSize: 1024/);
assert.match(wall, /Math\.min\(window\.devicePixelRatio \|\| 1, 2\)/);
assert.match(wall, /saved\.getContext\("2d"\)\.drawImage\(canvas/);
assert.match(wall, /prefers-reduced-motion: reduce/);
assert.match(wall, /renderStatic\(activeContext, plan/);
assert.match(wall, /now - zeroSince > 1000/);
assert.match(wall, /pseudoSpectrum\(frequencyData/);
assert.match(wall, /now - silentSince > 2000/);
assert.match(wall, /visibilitychange/);
assert.match(wall, /cancelAnimationFrame/);
assert.match(wall, /opacity \$\{DRY_TIME\}ms/);
assert.match(wall, /Math\.min\(0\.25,/);
assert.match(wall, /drawIncrement\(activeContext/, "프레임은 새 선분만 그려야 한다");
assert.doesNotMatch(wall.slice(wall.indexOf("const frame ="), wall.indexOf("const start =")), /clearRect|drawImage/, "프레임 루프에서 전체 재드로하면 안 된다");
assert.match(wall, /className="pointer-events-none fixed inset-0 -z-10/);
assert.match(player, /<InkWall audioRef=\{audioRef\} track=\{track\} playing=\{playing\} \/>/);
assert.match(player, /crossOrigin="anonymous"/);
assert.match(layout, /<body className="isolate/);

console.log("✓ 잉크 월 — 증분 렌더·수명·CORS 폴백·모션 감소 계약");
