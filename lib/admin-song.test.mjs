import assert from "node:assert/strict";
import { toAdminSong } from "./admin/admin-song.js";

assert.deepEqual(toAdminSong(), {
  slug: "",
  title: "(제목 없음)",
  title_ko: "",
  artist: "(아티스트 없음)",
  artist_ko: "",
  album: "",
  tags: [],
  searchAliases: [],
  artwork: "",
  comment: "",
  hasTranslation: false,
});

assert.equal(toAdminSong({ stanzas: [{ lines: [{ ko: "번역" }] }] }).hasTranslation, true);
assert.equal(toAdminSong({ stanzas: [{ lines: null }, null] }).hasTranslation, false);
assert.equal(toAdminSong({ artwork: { url: "wrong" }, comment: 42 }).artwork, "");
assert.deepEqual(
  toAdminSong({ title_ko: "아무것도 없어", artist_ko: "와스레란네에요", album: "싱글", tags: ["J-Rock"], search_aliases: ["난모네"] }),
  {
    slug: "", title: "(제목 없음)", title_ko: "아무것도 없어",
    artist: "(아티스트 없음)", artist_ko: "와스레란네에요", album: "싱글",
    tags: ["J-Rock"], searchAliases: ["난모네"], artwork: "", comment: "", hasTranslation: false,
  }
);

console.log("admin song adapter passed");
