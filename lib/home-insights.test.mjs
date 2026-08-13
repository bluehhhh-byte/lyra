import assert from "node:assert/strict";
import { buildHomeInsights, shiftSentence } from "./home-insights.js";

const songs = Array.from({ length: 16 }, (_, index) => ({
  slug: `song-${index}`,
  title: `Song ${index}`,
  artist: `Artist ${index}`,
  artwork: `https://example.com/${index}.jpg`,
  published: `2026-08-${String(16 - index).padStart(2, "0")}T00:00:00Z`,
  year: 2020,
  tags: ["영미", "Rock"],
  emotion: index < 10 ? "고독" : "희망",
  keywords: [],
}));
const movies = Array.from({ length: 16 }, (_, index) => ({
  slug: `movie-${index}`,
  title: `Movie ${index}`,
  director: `Director ${index}`,
  poster: `https://example.com/poster-${index}.jpg`,
  published: `2026-07-${String(16 - index).padStart(2, "0")}T00:00:00Z`,
}));

const result = buildHomeInsights(songs, movies);
assert.equal(result.recent.filter((item) => item.kind === "music").length, 4);
assert.equal(result.recent.filter((item) => item.kind === "movie").length, 2);
assert.equal(result.revisit.filter((item) => item.kind === "music").length, 2);
assert.equal(result.revisit.filter((item) => item.kind === "movie").length, 2);
assert.match(result.portrait, /컬렉션/);
assert.match(shiftSentence(result.shift), /최근 10곡/);
