import assert from "node:assert/strict";
import { findDuplicateSong } from "./admin/song-duplicate.js";

const songs = [
  { slug: "existing", trackId: "123", artist: "Kenshi Yonezu", title: "地球儀" },
  { slug: "other", trackId: "456", artist: "GLAY", title: "However" },
];
assert.equal(findDuplicateSong({ trackId: 123, artist: "x", title: "y" }, songs)?.slug, "existing");
assert.equal(findDuplicateSong({ artist: "Ｋｅｎｓｈｉ　Ｙｏｎｅｚｕ", title: "地球儀!" }, songs)?.reason, "artist-title");
assert.equal(findDuplicateSong({ trackId: "123", artist: "Kenshi Yonezu", title: "地球儀" }, songs, { excludeSlug: "existing" }), null);
assert.equal(findDuplicateSong({ artist: "new", title: "song" }, songs), null);
console.log("duplicate song registration guard passed");
