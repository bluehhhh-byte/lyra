import assert from "node:assert/strict";
import fs from "node:fs";
import {
  correctionEvidenceId,
  correctionEvidenceRows,
  correctionEvidenceState,
  correctionEvidenceSummary,
} from "./admin/correction-evidence.js";

const items = [
  { slug: "a", type: "translation_wrong", sourceUrl: " https://example.com/a " },
  { slug: "b", type: "original_typo", sourceUrl: "" },
  { slug: "c", type: "line_split", sourceUrl: "javascript:alert(1)" },
];
assert.equal(correctionEvidenceState(items[0]), "documented");
assert.equal(correctionEvidenceState(items[1]), "missing");
assert.equal(correctionEvidenceState(items[2]), "invalid");
assert.deepEqual(correctionEvidenceSummary(items), { total: 3, documented: 1, missing: 1, invalid: 1 });
const rows = correctionEvidenceRows(items);
assert.equal(rows.length, 3);
assert.match(rows[0].evidenceId, /^[a-f0-9]{16}$/);
assert.equal(correctionEvidenceId(items[0], 0), rows[0].evidenceId, "같은 기록의 식별자는 안정적이어야 한다");
assert.notEqual(correctionEvidenceId(items[0], 0), correctionEvidenceId(items[0], 1), "중복 기록도 구분해야 한다");

const stored = JSON.parse(fs.readFileSync(new URL("../data/lyrics-corrections.json", import.meta.url), "utf8")).items;
const storedRows = correctionEvidenceRows(stored);
const storedSummary = correctionEvidenceSummary(stored);
assert.ok(storedSummary.total > 0 && storedSummary.documented > 0, "실제 장부의 근거 현황을 집계해야 한다");
assert.equal(storedSummary.invalid, 0, "실제 장부에 잘못된 URL이 있으면 안 된다");
assert.equal(new Set(storedRows.map((item) => item.evidenceId)).size, storedRows.length, "실제 장부 식별자가 중복되면 안 된다");

const api = fs.readFileSync(new URL("../app/api/admin/songs.js", import.meta.url), "utf8");
const ui = fs.readFileSync(new URL("../app/admin/lyrics-audit.js", import.meta.url), "utf8");
assert.match(api, /action === "auditEvidenceSave"/);
assert.match(api, /correctionEvidenceState\(\{ sourceUrl \}\) !== "documented"/);
assert.match(api, /교정 근거 URL이 필요합니다/);
assert.match(ui, /근거 누락/);
assert.match(ui, /auditEvidenceSave/);
assert.match(ui, /evidenceState/);

console.log("correction evidence tests passed");
