import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../app/layout.js", import.meta.url), "utf8");

test("skip link is the first focusable body element and hidden until focus", () => {
  const body = source.slice(source.indexOf("<body"), source.indexOf("</body>"));
  assert.ok(body.indexOf("href=\"#main-content\"") < body.indexOf("<PlayerProvider>"));
  assert.match(body, /className="sr-only focus:not-sr-only/);
  assert.match(body, /본문으로 건너뛰기/);
});

test("main landmark is an addressable focus target", () => {
  assert.match(source, /<main id="main-content" tabIndex=\{-1\}/);
});
