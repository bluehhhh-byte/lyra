import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("audio seek control is keyboard reachable and exposes its value", () => {
  const source = fs.readFileSync(new URL("../app/player.js", import.meta.url), "utf8");
  assert.match(source, /role="slider"/);
  assert.match(source, /tabIndex=\{0\}/);
  assert.match(source, /aria-valuenow=\{Math\.round\(progress \* 100\)\}/);
  assert.match(source, /\["ArrowLeft", "ArrowRight"\]/);
});

test("global focus ring stays visible", () => {
  const css = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /:focus-visible\s*\{[\s\S]*outline: 2px solid var\(--color-accent\)/);
});
