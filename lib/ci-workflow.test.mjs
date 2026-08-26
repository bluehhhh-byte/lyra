import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(new URL("../.github/workflows/check.yml", import.meta.url), "utf8");

test("CI restores the private export and runs the real Instagram verifier", () => {
  assert.match(workflow, /schedule:[\s\S]*cron: "23 18 \* \* 1"/);
  assert.match(workflow, /secrets\.INSTAGRAM_EXPORT_URL/);
  assert.match(workflow, /pnpm verify:instagram -- "\$INSTAGRAM_EXPORT_DIR"/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
  assert.doesNotMatch(workflow, /sed -i|perl -pi|git commit/, "원문 대조 작업은 콘텐츠를 수정하지 않아야 한다");
});

test("CI installs Chromium and runs numerical layout verification", () => {
  assert.match(workflow, /pnpm exec playwright install --with-deps chromium/);
  assert.match(workflow, /next start -p 3401/);
  assert.match(workflow, /node scripts\/verify-layout\.mjs http:\/\/localhost:3401/);
});
