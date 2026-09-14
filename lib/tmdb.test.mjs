import assert from "node:assert/strict";
import test from "node:test";

process.env.TMDB_API_KEY = "test-key";
const originalFetch = globalThis.fetch;
const { searchMovies, movieDetail } = await import("./tmdb.js?unit-test");

test.after(() => { globalThis.fetch = originalFetch; });

test("TMDB search filters people and maps movie/TV results", async () => {
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(new URL(url));
    return { ok: true, json: async () => ({ results: [
      { id: 1, media_type: "person", name: "제외" },
      { id: 2, media_type: "tv", name: "드라마", original_name: "Drama", first_air_date: "2024-01-01", poster_path: "/p.jpg" },
    ] }) };
  };
  const results = await searchMovies("검색어");
  assert.equal(requested[0].pathname, "/3/search/multi");
  assert.equal(requested[0].searchParams.get("api_key"), "test-key");
  // 한글로 치든 영어로 치든 같은 작품이 나와야 한다. TMDB는 둘 다 매칭하지만
  // 순위가 언어마다 달라, 두 언어를 각각 물어 합친다.
  assert.deepEqual(
    requested.map((url) => url.searchParams.get("language")).sort(),
    ["en-US", "ko-KR"],
  );
  // 같은 작품이 두 언어에서 모두 나와도 한 줄이다
  assert.deepEqual(results.map(({ tmdbId, kind, year }) => ({ tmdbId, kind, year })), [{ tmdbId: 2, kind: "드라마", year: "2024" }]);
});

test("a title only the English index ranks still shows up", async () => {
  // `Parasite`를 ko-KR로만 검색하면 「패러사이트 돌즈」가 1위로 오고 「기생충」은
  // 목록에 없다. 영어로 친 검색어는 en-US 쪽 1위가 목록 1위여야 한다.
  globalThis.fetch = async (url) => {
    const english = new URL(url).searchParams.get("language") === "en-US";
    return { ok: true, json: async () => ({ results: english
      ? [{ id: 496243, media_type: "movie", title: "Parasite", original_title: "기생충", release_date: "2019-05-30" }]
      : [{ id: 111, media_type: "movie", title: "패러사이트 돌즈", original_title: "Parasite Dolls", release_date: "2003-01-01" }] }) };
  };
  const results = await searchMovies("Parasite");
  assert.equal(results[0].tmdbId, 496243, "영어 검색어인데 한국어 1위가 먼저 왔다");
  assert.equal(results[1].tmdbId, 111, "다른 언어의 결과도 버리지 않는다");

  // 한글로 치면 반대다
  const korean = await searchMovies("기생충");
  assert.equal(korean[0].tmdbId, 111);
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
