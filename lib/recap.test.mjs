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

console.log("✓ recap summarizes archive periods");
console.log("all passed");
