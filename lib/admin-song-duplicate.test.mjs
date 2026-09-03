import assert from "node:assert/strict";
import { findDuplicateSong, findDuplicateSongGroups } from "./admin/song-duplicate.js";

const songs = [
  { slug: "existing", trackId: "123", artist: "Kenshi Yonezu", title: "地球儀" },
  { slug: "other", trackId: "456", artist: "GLAY", title: "However" },
];
assert.equal(findDuplicateSong({ trackId: 123, artist: "x", title: "y" }, songs)?.slug, "existing");
assert.equal(findDuplicateSong({ artist: "Ｋｅｎｓｈｉ　Ｙｏｎｅｚｕ", title: "地球儀!" }, songs)?.reason, "artist-title");
assert.equal(findDuplicateSong({ trackId: "123", artist: "Kenshi Yonezu", title: "地球儀" }, songs, { excludeSlug: "existing" }), null);
assert.equal(findDuplicateSong({ artist: "new", title: "song" }, songs), null);
const groups = findDuplicateSongGroups([...songs, { slug: "copy", trackId: "123", artist: "Kenshi Yonezu", title: "地球儀!" }]);
assert.equal(groups.length, 1, "같은 두 곡이 trackId·제목 양쪽에서 중복 집계되면 안 된다");
assert.deepEqual(groups[0].songs.map((song) => song.slug), ["copy", "existing"]);
console.log("duplicate song registration guard passed");
