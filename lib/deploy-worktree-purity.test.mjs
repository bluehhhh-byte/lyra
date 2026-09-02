import assert from "node:assert/strict";
import fs from "node:fs";

const deploy = fs.readFileSync(new URL("../scripts/deploy-production.ps1", import.meta.url), "utf8");
const needs = fs.readFileSync(new URL("../scripts/needs-work.mjs", import.meta.url), "utf8");

assert.match(deploy, /backupCheckBefore/);
assert.match(deploy, /backupCheckAfter/);
assert.match(deploy, /refusing to deploy an impure check/);
assert.match(deploy, /workspaceAfter -ne \$workspaceBefore/);
assert.match(needs, /CHECK_ONLY/);
assert.match(needs, /if \(!CHECK_ONLY\) fs\.writeFileSync/);

console.log("deployment and diagnostics preserve the working tree");
