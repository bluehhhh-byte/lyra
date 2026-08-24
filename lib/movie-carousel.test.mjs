import assert from "node:assert/strict";
import {
  buildMovieCarouselCatalog,
  buildMovieCarouselPreset,
  gridForCount,
  MOVIE_CAROUSEL_LIMIT,
  MOVIE_CAROUSEL_SLIDES,
} from "./movie-carousel.js";
import { getWatched } from "./watched.js";
import { getAllMovies } from "./movies.js";

const movie = (i, extra = {}) => ({
  code: `m${i}`,
  tmdbId: i,
  title: `Movie ${String(i).padStart(2, "0")}`,
  title_ko: `영화 ${String(i).padStart(2, "0")}`,
  year: String(1990 + (i % 35)),
  rating: 5,
  country: i % 2 ? "한국" : "일본",
  poster: `https://image.tmdb.org/t/p/w500/${i}.jpg`,
  ...extra,
});

const watched = Array.from({ length: 40 }, (_, i) => movie(i + 1));
const reviews = [{ ...movie(34), comment: "기억이 사라져도 감정은 다른 형태로 남는다." }];

{
  const preset = { id: "five", label: "★5", kind: "rating-eq", value: 5 };
  const result = buildMovieCarouselPreset(preset, watched, reviews);
  assert.equal(result.total, 40);
  assert.equal(result.selectedCount, MOVIE_CAROUSEL_LIMIT);
  assert.equal(result.omittedCount, 22, "18편을 넘긴 수를 조용히 버리면 안 된다");
  assert.equal(result.slides.length, MOVIE_CAROUSEL_SLIDES);
  assert.deepEqual(result.slides.map((slide) => slide.role), ["cover", "list", "list", "list", "closing"]);
  assert.deepEqual(result.slides.slice(1, 4).map((slide) => slide.movies.length), [6, 6, 6]);
  assert.equal(result.slides[1].movies[0].year, "2024", "별점 동률이면 최신 연도부터여야 한다");
  assert.match(result.closing.comment, /감정/, "선택한 작품 중 실제 Cyno 코멘트를 맺음에 써야 한다");
}

assert.deepEqual(gridForCount(1), { columns: 1, rows: 1 });
assert.deepEqual(gridForCount(4), { columns: 2, rows: 2 });
assert.deepEqual(gridForCount(6), { columns: 3, rows: 2 });
assert.deepEqual(gridForCount(9), { columns: 3, rows: 3 });

{
  const custom = [{ id: "six", label: "여섯 편", kind: "country", value: "한국" }];
  const catalog = buildMovieCarouselCatalog(watched.slice(0, 12), reviews, custom);
  assert.equal(catalog.length, 0, "목록 3장을 채우지 못하는 주제는 5장 프리셋으로 노출하지 않는다");
}

{
  const actual = buildMovieCarouselCatalog(getWatched(), getAllMovies());
  assert.equal(actual.length, 5, "실제 데이터에서 다섯 프리셋이 모두 생성되어야 한다");
  for (const preset of actual) {
    assert.equal(preset.slides.length, 5, `${preset.id}: 다섯 장이어야 한다`);
    assert.deepEqual(preset.slides.slice(1, 4).map((slide) => slide.movies.length), [6, 6, 6]);
    assert.ok(preset.omittedCount > 0, `${preset.id}: 잘라낸 편수를 표시해야 한다`);
    assert.ok(preset.closing?.comment, `${preset.id}: 선택 작품의 실제 코멘트가 필요하다`);
  }
}

console.log("Cyno carousel data contract passed");
