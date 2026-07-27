import assert from "node:assert/strict";
import { parseCollection } from "./collections.js";

const collection = parseCollection(
  [
    "---",
    "title: 비 오는 밤",
    "description: 천천히 다시 보고 싶은 작품",
    "visibility: private",
    "date: 2026-07-28",
    "updated: 2026-07-28T20:00:00.000Z",
    "---",
    "- eternal-sunshine-of-the-spotless-mind",
    "- 기생충-2019",
    "",
  ].join("\n"),
  "rainy-night"
);

assert.equal(collection.title, "비 오는 밤");
assert.equal(collection.visibility, "private");
assert.deepEqual(collection.movieSlugs, [
  "eternal-sunshine-of-the-spotless-mind",
  "기생충-2019",
]);

const defaults = parseCollection("---\ntitle: 기본\n---\n상자-속의-양-2026", "default");
assert.equal(defaults.visibility, "public");
assert.deepEqual(defaults.movieSlugs, ["상자-속의-양-2026"]);

console.log("✓ curated collections parse metadata and ordered movie slugs");
console.log("all passed");
