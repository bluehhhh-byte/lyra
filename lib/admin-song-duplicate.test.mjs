import assert from "node:assert/strict";
import { findDuplicateSong, findDuplicateSongGroups, mergeDuplicateSongDocuments } from "./admin/song-duplicate.js";

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
const canonicalRaw = `---\ntitle: Song\nartist: Artist\ntags: [Rock]\ncomment: kept\n---\n`;
const duplicateRaw = `---\ntitle: Song!\ntitle_ko: 노래\nartist: Artist\ntags: [Rock, 일본]\nkeywords: [밤]\ncomment: overwritten\n---\nlyric\n> 번역\n`;
const merged = mergeDuplicateSongDocuments(canonicalRaw, duplicateRaw, {
  canonicalSlug: "song", duplicateSlug: "song-copy", at: new Date("2026-09-04T00:00:00Z"),
});
assert.match(merged.canonicalRaw, /^comment: kept$/m, "대표 곡의 값은 덮어쓰면 안 된다");
assert.match(merged.canonicalRaw, /^title_ko: 노래$/m);
assert.match(merged.canonicalRaw, /^tags: \[Rock, 일본\]$/m);
assert.match(merged.canonicalRaw, /^keywords: \[밤\]$/m);
assert.match(merged.canonicalRaw, /lyric\n> 번역/, "대표 곡에 가사가 없을 때만 중복 가사를 가져온다");
assert.match(merged.duplicateRaw, /^duplicate_of: song$/m);
console.log("duplicate song registration guard passed");
