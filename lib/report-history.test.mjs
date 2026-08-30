import assert from "node:assert/strict";
import { appendReportVersion, previousReportVersions } from "./report-history.js";

const first = { text: "첫 리포트", count: 10, at: "2026-08-01T00:00:00.000Z" };
const second = { text: "두 번째 리포트", count: 12, at: "2026-08-02T00:00:00.000Z" };
const third = { text: "세 번째 리포트", count: 15, mean: 3.8, at: "2026-08-03T00:00:00.000Z" };

const afterSecond = appendReportVersion(first, second);
assert.deepEqual(afterSecond.history.map((report) => report.text), ["첫 리포트", "두 번째 리포트"]);
assert.equal(afterSecond.text, "두 번째 리포트", "루트에는 최신 리포트를 유지한다");

const afterThird = appendReportVersion(afterSecond, third);
assert.deepEqual(afterThird.history.map((report) => report.text), ["첫 리포트", "두 번째 리포트", "세 번째 리포트"]);
assert.deepEqual(previousReportVersions(afterThird).map((report) => report.text), ["두 번째 리포트", "첫 리포트"]);
assert.equal(afterThird.history[2].mean, 3.8);

console.log("✓ AI 리포트가 최신 필드와 과거 버전 이력에 함께 누적된다");
