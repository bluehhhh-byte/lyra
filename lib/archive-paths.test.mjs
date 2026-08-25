import assert from "node:assert/strict";
import { archiveMonths, archivePath, archiveThemeParams, latestMonthByTheme } from "./archive-paths.js";

const archive = [
  { day: "2026-07-02", items: [{ type: "movie", themes: ["기억"] }] },
  { day: "2026-08-01", items: [{ type: "song" }] },
  { day: "2026-08-20", items: [{ type: "movie", themes: ["사랑"] }] },
];

assert.deepEqual(archiveMonths(archive), ["2026-07", "2026-08"]);
assert.equal(archivePath("2026-08"), "/archive/2026-08");
assert.equal(archivePath("2026-08", "사랑"), "/archive/2026-08/%EC%82%AC%EB%9E%91");
assert.deepEqual(archiveThemeParams(archive, ["기억", "사랑"]), [
  { month: "2026-07", theme: "기억" },
  { month: "2026-07", theme: "사랑" },
  { month: "2026-08", theme: "기억" },
  { month: "2026-08", theme: "사랑" },
]);
assert.deepEqual(latestMonthByTheme(archive, ["기억", "사랑", "상실"]), {
  기억: "2026-07",
  사랑: "2026-08",
  상실: "",
});

console.log("archive static paths passed");
