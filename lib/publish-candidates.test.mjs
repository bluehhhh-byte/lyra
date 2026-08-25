import assert from "node:assert/strict";
import { publishCandidates } from "./publish-candidates.js";

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

console.log("publish candidates passed");
