import assert from "node:assert/strict";
import { getAllPeople, splitCast } from "./people.js";

assert.deepEqual(splitCast("A, B, C"), ["A", "B", "C"]);
const movies = [
  { slug: "one", director: "Director", cast: "Actor, Director", rating: 4 },
  { slug: "two", director: "Director", cast: "Actor", rating: 5 },
];
const people = getAllPeople(movies);
assert.equal(people.find((person) => person.name === "Director").works.length, 2);
assert.equal(people.find((person) => person.name === "Actor").averageRating, 4.5);

console.log("✓ people index directors and cast without duplicate works");
console.log("all passed");
