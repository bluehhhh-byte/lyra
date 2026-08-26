import assert from "node:assert/strict";
import { parseLyrics } from "./songs.js";
import { repeatedStanzaDisplay } from "./lyric-display.js";

const stanzas = parseLyrics("Hook\n> 후렴\n\nVerse\n> 벌스\n\nHook\n> 후렴\n\nHook\n> 후렴");
const before = JSON.stringify(stanzas);
const display = repeatedStanzaDisplay(stanzas);
assert.deepEqual(display.map((row) => row.collapsed), [false, false, true, true]);
assert.equal(display[2].repeatCount, 3);
assert.equal(display[2].occurrence, 2);
assert.equal(JSON.stringify(stanzas), before, "파싱 결과와 원본 줄은 표시 판정으로 바뀌지 않는다");
assert.ok(repeatedStanzaDisplay(stanzas.slice(0, 3)).every((row) => !row.collapsed), "2회 반복은 접지 않는다");
console.log("✓ 3회 이상 반복 연은 첫 연 이후 표시만 접고 파싱 결과를 보존");
