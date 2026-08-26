import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeNewlines, parseFrontmatter, parseLyrics } from "./songs.js";

assert.equal(normalizeNewlines("a\r\nb\rc"), "a\nb\nc");
const parsed = parseFrontmatter("---\r\ntitle: Test\r\ntags: [a, b]\r\n---\r\nLine\r\n> 번역\r\n");
assert.equal(parsed.meta.title, "Test");
assert.equal(parsed.body, "Line\n> 번역\n");
assert.equal(parseLyrics(parsed.body)[0].lines[0].ko, "번역");

const songsSource = readFileSync(new URL("./songs.js", import.meta.url), "utf8");
const moviesSource = readFileSync(new URL("./movies.js", import.meta.url), "utf8");
assert.match(songsSource, /export function parseFrontmatter\(raw\) \{\s+raw = normalizeNewlines\(raw\)/);
assert.doesNotMatch(songsSource, /parseSongRecord\([^\n]*replace\(\/\\r\\n/);
assert.doesNotMatch(moviesSource, /parseMovieRecord\([^\n]*replace\(\/\\r\\n/);
