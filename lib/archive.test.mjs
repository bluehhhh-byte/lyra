import assert from "node:assert/strict";
import { buildArchive } from "./archive.js";

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
    },
  ],
});

assert.equal(archive.length, 1);
assert.equal(archive[0].items.length, 2);
assert.equal(archive[0].songs, 1);
assert.equal(archive[0].movies, 1);
assert.equal(archive[0].dominant, "그리움");
assert.deepEqual(archive[0].keywords, [["기억", 1], ["밤", 1]]);

console.log("✓ archive combines songs and movies by recording day");
console.log("all passed");
