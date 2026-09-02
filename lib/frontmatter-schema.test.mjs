import assert from "node:assert/strict";
import { frontmatterValueState, validateFrontmatter } from "./admin/frontmatter.js";

assert.equal(frontmatterValueState(null), "null");
assert.equal(frontmatterValueState(0), "zero");
assert.equal(frontmatterValueState(""), "empty");
assert.equal(frontmatterValueState(undefined), "missing");

assert.deepEqual(validateFrontmatter({ title: "곡", artist: "가수", lang: "ko", tags: [] }, "song"), []);
assert.deepEqual(validateFrontmatter({ title: "곡", artist: "가수", lang: "ko", search_aliases: ["별칭"] }, "song"), []);
assert.ok(validateFrontmatter({ title: "곡", artist: "가수", lang: "ko", search_aliases: "별칭" }, "song").includes("search_aliases 배열 아님"));
assert.deepEqual(validateFrontmatter({ title: "영화", media: "movie", rating: "", tags: [], themes: [] }, "movie"), []);
assert.ok(validateFrontmatter({ title: "영화", media: "movie", rating: null }, "movie").some((issue) => /null/.test(issue)));
assert.equal(validateFrontmatter({ title: "영화", media: "movie", rating: 0 }, "movie").some((issue) => /숫자 아님/.test(issue)), false);
assert.ok(validateFrontmatter({ artist: "가수", lang: "ko", tags: "한국" }, "song").includes("title 누락"));
assert.ok(validateFrontmatter({ title: "곡", artist: "가수", lang: "ko", tags: "한국" }, "song").includes("tags 배열 아님"));
