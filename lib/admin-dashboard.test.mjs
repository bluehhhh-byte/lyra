import assert from "node:assert/strict";
import fs from "node:fs";
import { buildAdminOverview } from "./admin/dashboard.js";

const completeSong = {
  stanzas: [{ lines: [] }], tags: ["한국", "Indie Rock"], keywords: [], emotion: "",
  comment: "기록", title_ko: "제목", artwork: "https://cover", year: "2026", instrumental: true,
};
const overview = buildAdminOverview({
  songs: [completeSong],
  movies: [{ tags: ["드라마"], comment: "기록", synopsis: ["줄거리"], year: 2026, poster: "https://poster" }],
  contentStore: "neon",
  contentFallback: true,
  deployment: { status: "READY", commitSha: "abc", deploymentId: "dpl_1", updatedAt: "2026-08-27T00:00:00Z" },
});
assert.deepEqual(
  { songCount: overview.songCount, movieCount: overview.movieCount, songNeeds: overview.songNeeds, movieNeeds: overview.movieNeeds },
  { songCount: 1, movieCount: 1, songNeeds: 0, movieNeeds: 0 }
);
assert.equal(overview.contentFallback, true);
assert.equal(overview.deployment.updatedAt, "2026-08-27T00:00:00.000Z");

const component = fs.readFileSync(new URL("../app/admin/admin-overview.js", import.meta.url), "utf8");
assert.match(component, /role="alert"/);
assert.match(component, /DB 연결 실패/);
assert.match(component, /파일 백업으로 읽는 중/);

console.log("관리자 현황판 검증 통과");
