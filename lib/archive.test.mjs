import assert from "node:assert/strict";
import { buildArchive, sameDayRecords } from "./archive.js";
import { monthNarrative, monthlyStats } from "./archive-stats.js";

const archive = buildArchive({
  songs: [
    {
      slug: "song-a",
      title: "Song A",
      artist: "Artist",
      artwork: "/a.jpg",
      date: "2026-07-28",
      emotion: "그리움",
      keywords: ["밤", "기억"],
    },
  ],
  movies: [
    {
      slug: "movie-a",
      title: "Movie A",
      director: "Director",
      poster: "/m.jpg",
      date: "2026-07-28",
      rating: 4.5,
      themes: ["기억", "가족"],
    },
  ],
});

assert.equal(archive.length, 1);
assert.equal(archive[0].items.length, 2);
assert.equal(archive[0].songs, 1);
assert.equal(archive[0].movies, 1);
assert.equal(archive[0].dominant, "그리움");
assert.deepEqual(archive[0].keywords, [["기억", 1], ["밤", 1]]);
// 월 요약은 archive-stats의 실분석으로 — 행동 나열("기록했고")이 아니어야 한다
const narrative = monthNarrative(monthlyStats(archive)[0]);
assert.ok(narrative.length > 0);
assert.ok(!/기록했고|감상했고/.test(narrative));

console.log("✓ archive combines songs and movies by recording day");
console.log("all passed");

const dayLinks = sameDayRecords(
  { slug: "current", date: "2026-01-02" },
  [{ slug: "current", date: "2026-01-02" }, { slug: "other", title: "Other", artist: "A", date: "2026-01-02" }],
  [{ slug: "movie", title: "Movie", director: "D", date: "2026-01-02" }],
);
assert.deepEqual(dayLinks.map((item) => item.slug), ["movie", "other"]);
assert.deepEqual(sameDayRecords({ slug: "alone", date: "2026-01-03" }, [], []), []);
console.log("✓ 같은 날의 다른 기록만 연결");
