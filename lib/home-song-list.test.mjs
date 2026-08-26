import assert from "node:assert/strict";
import test from "node:test";
import { toHomeSong } from "./home-song-list.js";

test("home song strips lyrics and derives country and decade", () => {
  const item = toHomeSong({
    slug: "song", title: "Title", artist: "Artist", year: "1999", lang: "en",
    tags: ["Rock"], emotion: "기쁨", lyrics: [{ en: "secret", ko: "비밀" }], published: "2026-08-27",
  });
  assert.equal(item.country, "영미");
  assert.equal(item.decade, "1990s");
  assert.equal(item.recorded, "2026-08-27");
  assert.equal("lyrics" in item, false);
});

test("explicit country tag wins and missing year stays unknown", () => {
  const item = toHomeSong({ slug: "song", title: "T", artist: "A", tags: ["일본"], lang: "en" });
  assert.equal(item.country, "일본");
  assert.equal(item.decade, "미상");
});
