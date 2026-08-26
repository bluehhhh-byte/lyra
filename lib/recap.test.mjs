import assert from "node:assert/strict";
import { buildRecap } from "./recap.js";

const recap = buildRecap([
  {
    day: "2026-07-01",
    valence: -1,
    items: [
      { type: "song", subtitle: "Artist", emotion: "그리움", keywords: ["밤"] },
      { type: "movie", title: "Film", rating: 4.5 },
    ],
  },
], "2026-07");

assert.equal(recap.days.length, 1);
assert.equal(recap.songs.length, 1);
assert.equal(recap.movies.length, 1);
assert.equal(recap.emotions[0][0], "그리움");
assert.equal(recap.topMovie.title, "Film");
assert.equal(recap.annual, null, "월간 결산에는 연간 통계를 붙이지 않는다");

const annual = buildRecap([
  { day: "2026-01-01", valence: -2, items: [
    { type: "song", subtitle: "A", emotion: "슬픔", keywords: [] },
    { type: "song", subtitle: "A", emotion: "슬픔", keywords: [] },
    { type: "song", subtitle: "B", emotion: "고독", keywords: [] },
  ] },
  { day: "2026-02-01", valence: 2, items: [
    { type: "song", subtitle: "A", emotion: "기쁨", keywords: [] },
    { type: "song", subtitle: "A", emotion: "기쁨", keywords: [] },
    { type: "song", subtitle: "B", emotion: "설렘", keywords: [] },
  ] },
], "2026");
assert.deepEqual(annual.annual.topArtist, { name: "A", count: 4 });
assert.equal(annual.annual.emotionMovement.from, "2026-01");
assert.equal(annual.annual.emotionMovement.to, "2026-02");
assert.match(annual.annual.emotionMovement.label, /밝아지는 중/);
assert.equal(annual.annual.turningPoint.month, "2026-02");
assert.ok(annual.annual.turningPoint.distance > 1.25);

console.log("✓ recap summarizes archive periods");
console.log("✓ annual recap adds calculated artist, movement, and turning point");
console.log("all passed");
