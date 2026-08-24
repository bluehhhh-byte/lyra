import assert from "node:assert/strict";
import {
  buildConceptCarousel,
  buildSingleMovieCarousel,
  gridForCount,
  MOVIE_CAROUSEL_SLIDES,
  scoreMovieForConcept,
  splitMovieParagraphs,
} from "./movie-carousel.js";
import { getAllMovies } from "./movies.js";
import { getWatched } from "./watched.js";

const parasite = {
  slug: "parasite-2019",
  title: "Parasite",
  title_ko: "기생충",
  director_ko: "봉준호",
  cast: "송강호, 이선균, 조여정",
  year: "2019",
  runtime: "131",
  rating: 5,
  genre: "Comedy",
  poster: "https://image.tmdb.org/t/p/w500/poster.jpg",
  tags: ["한국", "Comedy", "2019"],
  themes: ["가족", "불안", "상실"],
  comment: "극과 극의 계층을 오가는 연출로 자본주의 사회의 비극을 선명하게 보여준다.",
  synopsis: [
    "전원 백수인 기택 가족의 장남 기우는 친구의 소개로 고액 과외 자리를 얻게 된다.",
    "박 사장의 저택에 들어간 가족의 계획은 예상하지 못한 사건으로 이어진다.",
  ],
};

{
  const result = buildSingleMovieCarousel(parasite);
  assert.equal(result.kind, "single");
  assert.equal(result.slides.length, 4, "본문 두 문단은 커버·총평과 합쳐 네 장이어야 한다");
  assert.deepEqual(result.slides.map((slide) => slide.role), ["cover", "about", "body", "body"]);
  assert.ok(result.slides.every((slide) => slide.movie.id === "parasite-2019"));
  assert.equal(result.slides[1].text, parasite.comment, "총평은 comment 원문이어야 한다");
  assert.deepEqual(result.slides.slice(2).flatMap((slide) => slide.paragraphs), parasite.synopsis, "본문을 만들거나 버리면 안 된다");
}

{
  const one = buildSingleMovieCarousel({ ...parasite, rating: null, synopsis: [parasite.synopsis[0]] });
  assert.equal(one.slides.length, 3, "본문 한 문단은 커버·총평·본문 한 장이어야 한다");
  assert.equal(one.movie.rating, null, "별점이 없어도 커버 데이터 계약이 유지되어야 한다");

  const fiveParagraphs = ["첫 문단", "둘째 문단", "셋째 문단", "넷째 문단", "다섯째 문단"];
  assert.deepEqual(splitMovieParagraphs(fiveParagraphs), [["첫 문단", "둘째 문단"], ["셋째 문단", "넷째 문단"], ["다섯째 문단"]]);
  const full = buildSingleMovieCarousel({ ...parasite, synopsis: fiveParagraphs });
  assert.equal(full.slides.length, MOVIE_CAROUSEL_SLIDES);
  assert.deepEqual(full.slides.slice(2).flatMap((slide) => slide.paragraphs), fiveParagraphs);

  const three = buildSingleMovieCarousel({ ...parasite, body_kind: "review", synopsis: fiveParagraphs.slice(0, 3) });
  assert.equal(three.slides.length, 5);
  assert.ok(three.slides.slice(2).every((slide) => slide.bodyLabel === "작품 노트"));
}

{
  const korean = { ...parasite, code: "k1", country: "한국" };
  const japanese = { ...parasite, code: "j1", title_ko: "괴물", country: "일본", tags: ["일본", "Mystery"] };
  assert.ok(scoreMovieForConcept(korean, "한국 가족") > scoreMovieForConcept(japanese, "한국 가족"));
  assert.ok(scoreMovieForConcept(korean, "가족과 사랑") > 0, "한국어 접속 조사는 핵심어 검색을 막으면 안 된다");
  const result = buildConceptCarousel("한국 가족", [japanese, korean], [parasite]);
  assert.equal(result.kind, "concept");
  assert.equal(result.slides.length, 5);
  assert.deepEqual(result.slides.map((slide) => slide.role), ["curation-cover", "curation-list", "curation-list", "curation-list", "curation-note"]);
  assert.equal(result.movies[0].country, "한국");
  assert.match(result.headline, /한국 가족/);
}

assert.deepEqual(gridForCount(1), { columns: 1, rows: 1 });
assert.deepEqual(gridForCount(4), { columns: 2, rows: 2 });
assert.deepEqual(gridForCount(6), { columns: 3, rows: 2 });

{
  const actualMovie = getAllMovies().find((movie) => movie.synopsis.length && movie.poster);
  assert.ok(actualMovie, "실제 상세 영화가 하나 이상 필요하다");
  const actualSingle = buildSingleMovieCarousel(actualMovie);
  assert.equal(actualSingle.slides.length, 2 + Math.min(3, actualMovie.synopsis.length));
  assert.deepEqual(actualSingle.slides.slice(2).flatMap((slide) => slide.paragraphs), actualMovie.synopsis);
  const actualConcept = buildConceptCarousel("한국", getWatched(), getAllMovies());
  assert.equal(actualConcept.slides.length, 5);
  assert.ok(actualConcept.selectedCount > 0, "실제 데이터에서 한국 영화가 선택되어야 한다");
}

console.log("Cyno admin carousel data contract passed");
