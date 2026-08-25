import assert from "node:assert/strict";
import { publishCandidates, unwrittenHighRatedCandidates } from "./publish-candidates.js";

const movie = (slug, published, rating, themes, extra = {}) => ({
  slug,
  title: slug.toUpperCase(),
  published,
  rating,
  themes,
  poster: "/poster.jpg",
  comment: "감상",
  ...extra,
});
const movies = [
  movie("new", "2026-08-20", null, ["사랑"]),
  movie("high", "2026-06-01", 5, ["사랑", "기억"]),
  movie("theme", "2026-05-01", 4, ["사랑"]),
  movie("missing-comment", "2026-08-21", 5, ["사랑"], { comment: "" }),
  movie("unrated", "2026-04-01", null, ["기억"]),
];

const result = publishCandidates(movies, { recentLimit: 1, rediscoveryLimit: 3, themeLimit: 3 });
assert.deepEqual(result.recent.map((item) => item.slug), ["new"]);
assert.equal(result.recent[0].rating, null, "별점이 없으면 ★0.0으로 만들지 않는다");
assert.deepEqual(result.rediscovery.map((item) => item.slug), ["high"]);
assert.match(result.rediscovery[0].reason, /★5\.0/);
assert.deepEqual(result.themes.map((item) => [item.theme, item.count]), [["사랑", 3]]);
assert.ok(result.themes[0].examples.includes("HIGH"));
assert.ok(![...result.recent, ...result.rediscovery].some((item) => item.slug === "missing-comment"));

const unwritten = unwrittenHighRatedCandidates([
  { code: "written-tmdb", title: "다른 제목", year: 2020, rating: 5, tmdbId: 10 },
  { code: "written-title", title: "Written", year: 2021, rating: 4.5 },
  { code: "candidate-low", title: "낮은 별점", year: 2024, rating: 4 },
  { code: "candidate-45", title: "후보 둘", year: 2023, rating: 4.5 },
  { code: "candidate-5", title: "후보 하나", year: 2022, rating: 5 },
], [
  { slug: "one", title: "등록됨", year: 2020, tmdbId: 10 },
  { slug: "two", title: " written ", year: 2021 },
]);
assert.deepEqual(unwritten.map((item) => item.key), ["candidate-5", "candidate-45"]);
assert.ok(unwritten.every((item) => item.rating >= 4.5));

console.log("publish candidates passed");
