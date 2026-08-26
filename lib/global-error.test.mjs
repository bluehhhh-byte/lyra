import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../app/global-error.js", import.meta.url), "utf8");

test("root error boundary supplies its own document and recovery actions", () => {
  assert.match(source, /^"use client"/);
  assert.match(source, /<html lang="ko">/);
  assert.match(source, /<body/);
  assert.match(source, /onClick=\{reset\}/);
  assert.match(source, /href="\/"/);
});

test("root error UI does not expose exception details", () => {
  assert.doesNotMatch(source, /error\.(?:message|stack|digest)|JSON\.stringify\(error\)|<pre/);
  assert.match(source, /페이지를 불러오지 못했습니다/);
});
