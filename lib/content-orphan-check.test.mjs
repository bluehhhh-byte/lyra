import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONTENT_DATA_FILES } from "./content-data-files.js";

assert.ok(CONTENT_DATA_FILES.includes("lyrics-corrections.json"));
assert.equal(new Set(CONTENT_DATA_FILES).size, CONTENT_DATA_FILES.length, "DB 백업 대상 이름은 중복되지 않아야 한다");

const dump = readFileSync(new URL("../scripts/dump-content.mjs", import.meta.url), "utf8");
assert.match(dump, /difference: before === null \? "DB에만 있음"/);
assert.match(dump, /difference: "파일에만 있음"/);
assert.match(dump, /for \(const p of planned\) console\.log/, "--check는 차이를 생략하지 않고 모두 출력해야 한다");
assert.match(dump, /if \(checkOnly\)[\s\S]*process\.exitCode[\s\S]*\} else \{[\s\S]*p\.write\?\.\(\)/, "check 분기에서는 쓰기 함수를 실행하지 않아야 한다");
assert.match(dump, /difference: "파일에만 있음"[\s\S]*write: null/, "data 고아는 자동 삭제하지 않아야 한다");
