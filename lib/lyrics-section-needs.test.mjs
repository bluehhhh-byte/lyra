import assert from "node:assert/strict";
import { needsLyricSections, songNeeds, summarizeNeeds } from "./admin/needs.js";

const lines = Array.from({ length: 20 }, (_, index) => ({ en: `lyric ${index % 10}`, ko: "번역" }));
const song = { lang: "en", tags: ["Rock"], keywords: ["밤"], emotion: "불안", comment: "설명", title_ko: "제목", artwork: "https://cover", year: "2026", stanzas: [{ section: null, lines }] };
assert.equal(needsLyricSections(song), true);
assert.equal(songNeeds(song).sections, 1);
assert.ok(summarizeNeeds(song).includes("가사 구간 검토"));
assert.equal(needsLyricSections({ ...song, stanzas: [{ section: "Chorus", lines }] }), false);
assert.equal(needsLyricSections({ ...song, stanzas: [{ section: null, lines: lines.slice(0, 10) }, { section: null, lines: lines.slice(10) }] }), false);
assert.equal(needsLyricSections({ ...song, stanzas: [{ section: null, lines: lines.slice(0, 8) }] }), false);
assert.equal(needsLyricSections({ ...song, instrumental: true }), false);
console.log("lyric section needs check passed");
