import assert from "node:assert/strict";
import {
  appearanceContext,
  appearanceIdentity,
  appearancesForMovie,
  appearancesForSong,
  normalizeAppearanceData,
} from "./song-appearances.js";

const data = normalizeAppearanceData({
  items: [
    {
      id: "verified",
      songSlug: "song-a",
      workTitle: "테스트 애니",
      workType: "anime_series",
      mediaType: "tv",
      tmdbId: 42,
      localMovieSlug: "test-anime",
      role: "opening",
      season: 2,
      episode: 3,
      status: "verified",
    },
    {
      id: "pending",
      songSlug: "song-a",
      workTitle: "검토 작품",
      mediaType: "movie",
      role: "trailer",
      status: "pending",
    },
  ],
});

assert.equal(appearancesForSong(data, "song-a").length, 1);
assert.equal(appearancesForSong(data, "song-a", { includePending: true }).length, 2);
assert.equal(appearancesForMovie(data, { slug: "different", tmdbId: "42" }).length, 1);
assert.equal(appearancesForMovie(data, { slug: "test-anime", tmdbId: null }).length, 1);
assert.equal(appearanceContext(data.items[0]), "TV 애니메이션 · 오프닝 · 시즌 2 · 3화");
assert.equal(
  appearanceIdentity(data.items[0]),
  "song-a|tmdb:tv:42|opening|2|3"
);

const malformed = normalizeAppearanceData({ items: [{ id: "", songSlug: "x", workTitle: "y" }, null] });
assert.deepEqual(malformed.items, []);

console.log("song appearance helpers ok");
