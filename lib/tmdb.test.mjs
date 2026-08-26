import assert from "node:assert/strict";
import test from "node:test";

process.env.TMDB_API_KEY = "test-key";
const originalFetch = globalThis.fetch;
const { searchMovies, movieDetail } = await import("./tmdb.js?unit-test");

test.after(() => { globalThis.fetch = originalFetch; });

test("TMDB search filters people and maps movie/TV results", async () => {
  let requested;
  globalThis.fetch = async (url) => {
    requested = new URL(url);
    return { ok: true, json: async () => ({ results: [
      { id: 1, media_type: "person", name: "제외" },
      { id: 2, media_type: "tv", name: "드라마", original_name: "Drama", first_air_date: "2024-01-01", poster_path: "/p.jpg" },
    ] }) };
  };
  const results = await searchMovies("검색어");
  assert.equal(requested.pathname, "/3/search/multi");
  assert.equal(requested.searchParams.get("api_key"), "test-key");
  assert.equal(requested.searchParams.get("language"), "ko-KR");
  assert.deepEqual(results.map(({ tmdbId, kind, year }) => ({ tmdbId, kind, year })), [{ tmdbId: 2, kind: "드라마", year: "2024" }]);
});

test("TMDB detail maps Korean genre, country and director", async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({
    id: 7, title: "제목", original_title: "Title", release_date: "2025-02-01", runtime: 120,
    production_countries: [{ iso_3166_1: "KR" }], genres: [{ name: "드라마" }],
    poster_path: "/poster.jpg", backdrop_path: "/backdrop.jpg",
    credits: { crew: [{ job: "Director", name: "감독" }], cast: [{ name: "배우 1" }, { name: "배우 2" }] },
  }) });
  const movie = await movieDetail(7);
  assert.equal(movie.director, "감독");
  assert.equal(movie.genre, "Drama");
  assert.equal(movie.country, "한국");
  assert.equal(movie.cast, "배우 1, 배우 2");
  assert.match(movie.poster, /\/w500\/poster\.jpg$/);
});
