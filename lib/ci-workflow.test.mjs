import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(new URL("../.github/workflows/check.yml", import.meta.url), "utf8");

test("CI restores the private export and runs the real Instagram verifier", () => {
  assert.match(workflow, /secrets\.INSTAGRAM_EXPORT_URL/);
  assert.match(workflow, /pnpm verify:instagram -- "\$INSTAGRAM_EXPORT_DIR"/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});

test("CI installs Chromium and runs numerical layout verification", () => {
  assert.match(workflow, /pnpm exec playwright install --with-deps chromium/);
  assert.match(workflow, /next start -p 3401/);
  assert.match(workflow, /node scripts\/verify-layout\.mjs http:\/\/localhost:3401/);
});
