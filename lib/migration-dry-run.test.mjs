import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../scripts/migrate-content.mjs", import.meta.url), "utf8");

test("migration defaults to dry-run and only writes with --apply", () => {
  assert.match(source, /const apply = process\.argv\.includes\("--apply"\)/);
  assert.match(source, /if \(apply\) \{[\s\S]*create table if not exists lyra_contents/);
  assert.match(source, /if \(apply\) \{[\s\S]*insert into lyra_contents/);
  assert.match(source, /\(dry-run\) 변경 예정/);
  assert.match(source, /실제로 반영하려면 --apply/);
});

test("legacy --verify remains a read-only failing consistency gate", () => {
  assert.match(source, /const verifyOnly = process\.argv\.includes\("--verify"\)/);
  assert.match(source, /!apply && !verifyOnly/);
});
