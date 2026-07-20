// The rescan offers a swap, then the replace guard re-checks it. If the two
// count lines differently the UI offers a song the server then refuses — which
// is exactly what happened when the guard counted [Verse 1] headers.
//   node lib/line-count.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseLyrics } from "./songs.js";

const src = fs.readFileSync(new URL("../app/api/admin/route.js", import.meta.url), "utf8");
const start = src.indexOf("export const lyricLineCount");
const end = src.indexOf(".length;", start) + ".length;".length;
assert.ok(start > 0 && end > start, "lyricLineCount not found in route.js — did it move?");
const { lyricLineCount } = await import(
  "data:text/javascript," + encodeURIComponent(src.slice(start, end))
);

const BODY = [
  "[Verse 1]",
  "That there",
  "> 저것은",
  "That's not me",
  "> 그건 내가 아니야",
  "// 해설 노트",
  "",
  "[Chorus]",
  "I'm not here",
  "+ 독음",
  "> 나는 여기 없어",
].join("\n");

// the scan measures a stored song through the parser; the guard measures raw
// text. Both must land on the same number or the feature contradicts itself.
const viaParser = parseLyrics(BODY).reduce(
  (n, st) => n + st.lines.filter((l) => l.en?.trim()).length,
  0
);
assert.equal(viaParser, 3, "parser sees 3 lyric lines");
assert.equal(lyricLineCount(BODY), viaParser, "guard must agree with the parser");
console.log("✓ guard and scan agree on a body with headers, notes and readings");

// headers are the regression: they used to inflate the guard's count
assert.equal(lyricLineCount("[Verse 1]\n[Chorus]\n[Bridge]"), 0, "headers alone count as no lyrics");
assert.equal(
  lyricLineCount("a\nb"),
  lyricLineCount("[Intro]\na\n\n[Verse 1]\nb"),
  "adding headers must not change the count"
);
console.log("✓ section headers never count as lyric lines");

// lrclib plain text (no annotations) measured on the same scale
assert.equal(lyricLineCount("one\ntwo\n\nthree"), 3, "plain lrclib body");
assert.equal(lyricLineCount(""), 0, "empty");
assert.equal(lyricLineCount(null), 0, "null is tolerated");
console.log("✓ plain and empty bodies");

console.log("all passed");
