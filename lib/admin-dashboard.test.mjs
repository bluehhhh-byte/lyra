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

// 결손은 개수만이 아니라 "어느 곡의 무엇"까지 나와야 한다. 개수만 있던 동안에는
// 현황판에 3건이라고 떠도 로컬에서 scripts/needs-work.mjs를 돌려야 알 수 있었다.
{
  const gappy = {
    slug: "gap-song", title: "빈 곡", artist: "아무개",
    stanzas: [{ lines: [] }], tags: ["한국", "Indie Rock"], keywords: [], emotion: "",
    comment: "", title_ko: "", artwork: "https://cover", year: "2026", instrumental: true,
  };
  const withGaps = buildAdminOverview({
    songs: [completeSong, gappy],
    movies: [{ slug: "gap-movie", title: "빈 영화", director: "감독", tags: [], comment: "", synopsis: [], year: 0, poster: "" }],
    contentStore: "neon",
  });
  assert.equal(withGaps.songNeeds, 1);
  assert.equal(withGaps.movieNeeds, 1);
  assert.equal(withGaps.needsList.length, 2, "결손이 있는 곡과 영화가 모두 목록에 담긴다");

  const song = withGaps.needsList.find((item) => item.kind === "song");
  assert.equal(song.slug, "gap-song");
  assert.equal(song.subtitle, "아무개");
  assert.ok(song.needs.includes("코멘트 없음"), `실제 결손 사유가 담긴다: ${song.needs.join(", ")}`);
  assert.ok(song.needs.includes("한글 제목 없음"));

  const movie = withGaps.needsList.find((item) => item.kind === "movie");
  assert.equal(movie.slug, "gap-movie");
  assert.ok(movie.needs.length > 0);

  // 결손 없는 곡은 목록에 들어가지 않는다 — 개수와 목록이 어긋나면 안 된다.
  assert.equal(withGaps.needsList.filter((item) => item.needs.length === 0).length, 0);
}

// 수백 건이면 화면에도 페이로드에도 부담이다. 잘라내되 몇 건을 잘랐는지는 남긴다.
{
  const many = Array.from({ length: 35 }, (_, i) => ({
    slug: `s${i}`, title: `곡 ${i}`, artist: "",
    stanzas: [{ lines: [] }], tags: ["한국", "Indie Rock"], keywords: [], emotion: "",
    comment: "", title_ko: "", artwork: "https://cover", year: "2026", instrumental: true,
  }));
  const capped = buildAdminOverview({ songs: many, movies: [], contentStore: "neon" });
  assert.equal(capped.songNeeds, 35, "개수는 자르지 않는다");
  assert.equal(capped.needsList.length, 30);
  assert.equal(capped.needsListTruncated, 5);
}

console.log("✓ 결손 목록 — 사유·잘라내기");
