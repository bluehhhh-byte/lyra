import assert from "node:assert/strict";
import { formatLyricQuote } from "./lyric-quote.js";
const text = formatLyricQuote([{ en: "Hello", ko: "안녕" }], { title: "Song", artist: "Artist" }, "https://example.com/songs/song#v0");
assert.match(text, /Hello\n안녕/);
assert.match(text, /— Artist — Song/);
assert.match(text, /출처: https:\/\/example\.com\/songs\/song#v0/);
console.log("✓ 가사 인용에 곡명·아티스트·출처 포함");
