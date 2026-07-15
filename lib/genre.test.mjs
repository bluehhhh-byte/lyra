// Genre validation must flag exactly the classes we've had to hand-fix.
//   node --test lib/genre.test.mjs
import assert from "node:assert/strict";
import { capGenre, genreTagOf, genreIssue, GENRES } from "./genre.js";

// capGenre maps Korean words and casing onto the English vocabulary
assert.equal(capGenre("얼터너티브"), "Alternative Rock");
assert.equal(capGenre("제이록"), "J-Rock");
assert.equal(capGenre("k-pop"), "K-Pop");
assert.equal(capGenre("R&B/Soul"), "R&B/Soul");

// genreTagOf picks the genre out of [country, genre, year]
assert.equal(genreTagOf(["한국", "Indie Rock", "2017"]), "Indie Rock");
assert.equal(genreTagOf(["영미", "2010"]), ""); // genre missing
assert.equal(genreTagOf(["일본", "J-Rock", "1999"]), "J-Rock");

// genreIssue flags the exact classes we hand-fixed, clears clean specific genres
assert.equal(genreIssue("얼터너티브"), "비표준 장르"); // Hangul leaked in
assert.equal(genreIssue("Alternative"), "비표준 장르"); // store genre, not our vocab
assert.equal(genreIssue(""), "장르 없음");
assert.equal(genreIssue("Rock"), "세분화 권장"); // bare umbrella
assert.equal(genreIssue("Pop"), "세분화 권장");
assert.equal(genreIssue("Indie Rock"), null); // clean, specific → no issue
assert.equal(genreIssue("J-Rock"), null);
assert.equal(genreIssue("Heavy Metal"), null);

// every vocabulary term except the two umbrellas is issue-free
for (const g of GENRES) {
  if (g === "Rock" || g === "Pop") continue;
  assert.equal(genreIssue(g), null, `${g} should be a clean genre`);
}

console.log("✓ genre validation flags the right classes");
console.log("all passed");
