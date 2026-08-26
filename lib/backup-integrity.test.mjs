import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contentDigest, sameStoredContent } from "./content-digest.js";

assert.equal(contentDigest("a\r\nb\r"), contentDigest("a\nb\n"), "플랫폼 줄바꿈은 같은 백업 내용이다");
assert.equal(sameStoredContent("same", "same"), true);
assert.equal(sameStoredContent("before", "after"), false);

const source = readFileSync(new URL("../scripts/dump-content.mjs", import.meta.url), "utf8");
assert.match(source, /const verifyOnly = process\.argv\.includes\("--verify"\)/);
assert.match(source, /if \(verifyOnly\)[\s\S]*SHA-256 대조[\s\S]*process\.exitCode/);
assert.match(source, /if \(verifyOnly\)[\s\S]*\} else if \(checkOnly\)[\s\S]*\} else \{[\s\S]*p\.write\?\.\(\)/, "verify 분기는 쓰기 분기와 분리돼야 한다");
