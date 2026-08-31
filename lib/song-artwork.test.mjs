import assert from "node:assert/strict";
import { getAllSongs } from "./songs.js";
import { CORRECTED_ARTWORK, validateSongs } from "../scripts/audit-song-artwork.mjs";

const songs = getAllSongs();
assert.deepEqual(validateSongs(songs), []);
assert.ok(songs.length >= 900);
assert.equal(songs.filter((song) => song.artwork_none).length, 0);

const bySlug = new Map(songs.map((song) => [song.slug, song]));
for (const [slug, artwork] of CORRECTED_ARTWORK) assert.equal(bySlug.get(slug)?.artwork, artwork, slug);

const negative = validateSongs([
  { slug: "missing", artwork: "", artwork_none: true },
  { slug: "fan-art", artwork: "https://example.com/fan.jpg" },
]);
assert.ok(negative.some((issue) => issue.code === "missing-or-invalid"));
assert.ok(negative.some((issue) => issue.code === "untrusted-source"));
console.log("official song artwork audit passed");
