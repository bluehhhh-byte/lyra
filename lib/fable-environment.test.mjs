import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [environment, logo, header, layout, css] = await Promise.all([
  readFile(new URL("../app/fable-environment.js", import.meta.url), "utf8"),
  readFile(new URL("../app/fable-logo.js", import.meta.url), "utf8"),
  readFile(new URL("../app/header.js", import.meta.url), "utf8"),
  readFile(new URL("../app/layout.js", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);

assert.match(environment, /createWall\(container/);
assert.match(environment, /hand\.sheet\(/);
assert.match(environment, /data-fable-wall/);
assert.match(environment, /data-fable-trail/);
assert.match(environment, /pointer: fine/);
assert.match(environment, /addEventListener\("touchmove", touchMove, \{ passive: true \}\)/);
assert.match(environment, /point\.stroke !== before\.stroke/);
assert.match(environment, /prefers-reduced-motion: reduce/);
assert.match(environment, /ResizeObserver/);
assert.match(environment, /wall\?\.destroy\(\)/);
assert.match(logo, /hand\.enso\(/);
assert.match(logo, /hand\.spark\(/);
assert.match(header, /<FableLogo/);
assert.match(layout, /<FableEnvironment/);
assert.match(layout, /className="fable-paper relative z-10/);
assert.match(css, /--color-bg: #12100e/);
assert.match(css, /:root:not\(\[data-theme="light"\]\) \.fable-paper/);
assert.match(environment, /PALETTE\.OCHRE/);
assert.match(environment, /PALETTE\.ROSE/);
assert.match(environment, /PALETTE\.TEAL/);
assert.match(environment, /PALETTE\.SLATE/);
assert.match(environment, /PALETTE\.SAGE/);
assert.match(environment, /colorIndex: Math\.floor\(traveled \/ 42\)/);
assert.match(environment, /MutationObserver/);

console.log("✓ Fable 전역 벽 — 찢긴 종이·로고·방문자 트레일·테마 계약");
