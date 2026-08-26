import assert from "node:assert/strict";
import test from "node:test";

process.env.LYRA_CONTENT_STORE = "neon";
process.env.DATABASE_URL = "postgresql://invalid:invalid@127.0.0.1:1/invalid";
process.env.LYRA_USAGE_METRICS = "off";

const [{ getAllSongs, getAllSongsRuntime }, { getAllMovies, getAllMoviesRuntime }, store, moments] = await Promise.all([
  import("./songs.js?db-down-test"),
  import("./movies.js?db-down-test"),
  import("./store.js?db-down-test"),
  import("./moments.js?db-down-test"),
]);

test("all four runtime readers serve their file backup when Neon is down", async () => {
  const [songs, movies, watched, momentRows] = await Promise.all([
    getAllSongsRuntime(),
    getAllMoviesRuntime(),
    store.readRuntimeData("watcha-movies.json", { movies: [] }),
    moments.getAllMomentsRuntime({ includeDrafts: true }),
  ]);
  assert.equal(songs.length, getAllSongs().length, "songs fallback");
  assert.equal(movies.length, getAllMovies().length, "movies fallback");
  assert.ok((watched.movies || watched).length > 1_000, "store JSON fallback");
  assert.ok(Array.isArray(momentRows), "moments fallback");
});

test("a production write fails explicitly instead of falling back to files", async () => {
  await assert.rejects(
    store.writeSong("db-down-proof", "---\ntitle: must-not-write\n---\n", "test"),
    /fetch failed|ECONNREFUSED|database|connect/i,
  );
});
