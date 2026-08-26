import assert from "node:assert/strict";
import fs from "node:fs";
import { buildAdminOverview } from "./admin/dashboard.js";

const overview = buildAdminOverview({
  songs: [{ slug: "song-a", title: "곡 A", stanzas: [{ lines: [] }], tags: ["한국", "Indie Rock"], comment: "기록", title_ko: "곡", artwork: "https://a", year: 2026, instrumental: true }],
  movies: [{ slug: "movie-a", title: "영화 A" }],
  history: [
    { kind: "song", slug: "song-a", revision: 3, updatedAt: "2026-08-27T01:00:00Z" },
    { kind: "movie", slug: "movie-a", revision: 2, updatedAt: "2026-08-27T00:00:00Z" },
  ],
});
assert.deepEqual(
  overview.history.map(({ kind, title, revision }) => ({ kind, title, revision })),
  [
    { kind: "song", title: "곡 A", revision: 3 },
    { kind: "movie", title: "영화 A", revision: 2 },
  ]
);

const source = fs.readFileSync(new URL("./content-db.js", import.meta.url), "utf8");
const historyQuery = source.slice(source.indexOf("export async function listRecentContentChanges"), source.indexOf("// 전곡 본문을 한 항목"));
assert.match(historyQuery, /from lyra_contents/);
assert.match(historyQuery, /order by updated_at desc/);
assert.doesNotMatch(historyQuery, /create table|insert into|update lyra_contents/i, "변경 이력 조회가 새 테이블이나 쓰기를 만들면 안 된다");

console.log("콘텐츠 변경 이력 검증 통과");
