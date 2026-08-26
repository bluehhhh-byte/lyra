import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(new URL("../.github/workflows/backup.yml", import.meta.url), "utf8");

test("daily backup dumps once and creates one atomic commit", () => {
  assert.match(workflow, /cron: "17 18 \* \* \*"/);
  assert.match(workflow, /node scripts\/dump-content\.mjs/);
  assert.equal((workflow.match(/git commit /g) || []).length, 1);
  assert.match(workflow, /git add -A -- songs movies data/);
});

test("backup uses a dated tag and never force-pushes a deployment branch", () => {
  assert.match(workflow, /tag="db-backup-/);
  assert.match(workflow, /git push origin "refs\/tags\/\$tag"/);
  assert.doesNotMatch(workflow, /git push[^\n]*(?:--force|-f\b)|refs\/heads/);
});
