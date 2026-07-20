// Gemini decides the mood, so the parsers are the trust boundary — a bad value
// must become "no mood", never a wrong one that ships to the page.
//   node lib/mood.test.mjs
import assert from "node:assert/strict";
import {
  MOOD_LEVELS,
  MOOD_LABELS,
  MOOD_COLORS,
  parseMoodLevel,
  parseMoodLabel,
  moodName,
  moodColor,
} from "./mood.js";

// the level scale and its colors must stay the same length or moodColor
// silently falls off the end
assert.equal(MOOD_LEVELS.length, 5);
assert.equal(MOOD_COLORS.length, MOOD_LEVELS.length, "one color per level");
assert.deepEqual(
  MOOD_LEVELS.map((m) => m.level),
  [1, 2, 3, 4, 5],
  "levels are 1..5 in order"
);
console.log("✓ scale and palette line up");

// Gemini returns a number, a numeric string, or occasionally the level's name
assert.equal(parseMoodLevel(3), 3, "number");
assert.equal(parseMoodLevel("4"), 4, "numeric string");
assert.equal(parseMoodLevel("잔잔"), 1, "level name");
assert.equal(parseMoodLevel(2.4), 2, "rounds");
console.log("✓ accepts the shapes Gemini actually returns");

// anything else is no mood at all — never a coerced 0 or NaN reaching the page
for (const bad of [0, 6, -1, "", "  ", null, undefined, "슬픔", "high", NaN, {}, []])
  assert.equal(parseMoodLevel(bad), null, `rejects ${JSON.stringify(bad)}`);
console.log("✓ out-of-range and junk levels are rejected");

// labels must come from the closed list, or the index sprouts synonyms
assert.equal(parseMoodLabel("그리움"), "그리움");
assert.equal(parseMoodLabel("  이별  "), "이별", "trims");
for (const bad of ["그리워", "애틋함", "nostalgia", "", null, undefined, 3])
  assert.equal(parseMoodLabel(bad), "", `rejects ${JSON.stringify(bad)}`);
assert.ok(MOOD_LABELS.every((l) => parseMoodLabel(l) === l), "every vocabulary term round-trips");
assert.equal(new Set(MOOD_LABELS).size, MOOD_LABELS.length, "no duplicate labels");
console.log("✓ labels are a closed vocabulary");

// renderers never throw on a missing mood — the field is optional everywhere
assert.equal(moodName(2), "차분");
assert.equal(moodName(null), "", "no mood renders as nothing");
assert.equal(moodName(99), "");
assert.equal(moodColor(1), MOOD_COLORS[0]);
assert.ok(moodColor(null).startsWith("var("), "falls back to a theme token, not undefined");
console.log("✓ renderers degrade quietly when a song has no mood");

console.log("all passed");
