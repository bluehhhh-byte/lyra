import assert from "node:assert/strict";
import { toAdminSong } from "./admin/admin-song.js";

assert.deepEqual(toAdminSong(), {
  slug: "",
  title: "(제목 없음)",
  artist: "(아티스트 없음)",
  artwork: "",
  comment: "",
  hasTranslation: false,
});

assert.equal(toAdminSong({ stanzas: [{ lines: [{ ko: "번역" }] }] }).hasTranslation, true);
assert.equal(toAdminSong({ stanzas: [{ lines: null }, null] }).hasTranslation, false);
assert.equal(toAdminSong({ artwork: { url: "wrong" }, comment: 42 }).artwork, "");

console.log("admin song adapter passed");
