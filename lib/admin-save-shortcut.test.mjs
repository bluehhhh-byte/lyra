import assert from "node:assert/strict";
import fs from "node:fs";
import { isSaveShortcut } from "./admin/save-shortcut.js";

assert.equal(isSaveShortcut({ key: "s", ctrlKey: true }), true);
assert.equal(isSaveShortcut({ key: "S", metaKey: true }), true);
assert.equal(isSaveShortcut({ key: "s" }), false);
assert.equal(isSaveShortcut({ key: "s", ctrlKey: true, shiftKey: true }), false);
assert.equal(isSaveShortcut({ key: "s", metaKey: true, altKey: true }), false);

const form = fs.readFileSync(new URL("../app/admin/edit/[slug]/edit-form.js", import.meta.url), "utf8");
assert.match(form, /window\.addEventListener\("keydown", keydown\)/);
assert.match(form, /event\.preventDefault\(\)/, "브라우저 기본 저장 대화상자를 막아야 한다");
assert.match(form, /void save\(\)/);

console.log("관리자 저장 단축키 검증 통과");
