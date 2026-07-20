// Stanza notes are the one part of a song body a rewrite can't regenerate.
// Smallest thing that fails if the requality replace starts eating them.
//   node lib/carry-notes.test.mjs
import assert from "node:assert/strict";

// route.js is a Next server route (imports lib/store, lib/tmdb). Pull just the
// function's source out and evaluate it — keeps the test dependency-free.
import fs from "node:fs";
const src = fs.readFileSync(new URL("../app/api/admin/route.js", import.meta.url), "utf8");
const start = src.indexOf("export function carryNotes");
const end = src.indexOf("\n}", src.indexOf("return { body: out.join", start)) + 2;
assert.ok(start > 0 && end > start, "carryNotes not found in route.js — did it move?");
const { carryNotes } = await import(
  "data:text/javascript," + encodeURIComponent(src.slice(start, end))
);

const OLD = [
  "[Verse 1]",
  "That there",
  "> 저것은",
  "That's not me",
  "> 그건 내가 아니야",
  "// 화자가 자신을 3인칭으로 밀어낸다",
  "",
  "[Chorus]",
  "I'm not here",
  "> 나는 여기 없어",
  "// 후렴의 해리감",
].join("\n");

// the replacement is a superset: more lines, different stanza breaks, no headers
const NEW = [
  "[Intro]",
  "Strobe lights",
  "> 스트로브 조명",
  "",
  "[Verse 1]",
  "That there",
  "> 저것은",
  "That's not me",
  "> 그건 내가 아니야",
  "I go where I please",
  "> 나는 원하는 곳으로 가",
  "",
  "[Chorus]",
  "I'm not here",
  "> 나는 여기 없어",
].join("\n");

const r = carryNotes(OLD, NEW);
assert.equal(r.kept, 2, "both notes carried");
assert.equal(r.lost, 0, "nothing dropped");
// each note lands in its old stanza, below the anchor's translation — never
// wedged between a lyric line and its own `>` companion
const lines = r.body.split("\n");
assert.equal(lines[lines.indexOf("That there") + 1], "> 저것은", "anchor keeps its translation adjacent");
assert.equal(lines[lines.indexOf("That there") + 2], "// 화자가 자신을 3인칭으로 밀어낸다", "verse note after the annotation block");
assert.equal(lines[lines.indexOf("I'm not here") + 2], "// 후렴의 해리감", "chorus note after the annotation block");
// the new lyrics survive intact
assert.ok(r.body.includes("I go where I please"), "new line kept");
assert.ok(r.body.includes("Strobe lights"), "new stanza kept");
console.log("✓ notes carry across a re-stanza'd replacement");

// a note whose anchor vanished is reported, never silently dropped
const gone = carryNotes(["Deleted line", "// 사라질 노트"].join("\n"), "Totally different\n> 완전히 다름");
assert.equal(gone.kept, 0);
assert.equal(gone.lost, 1, "unmatched note is counted so the UI can say so");
console.log("✓ unmatched note is reported, not hidden");

// no notes -> body untouched, not reformatted
const none = carryNotes("plain\n> 번역", NEW);
assert.equal(none.body, NEW, "body passes through byte-identical");
assert.equal(none.kept + none.lost, 0);
console.log("✓ no-note song passes through unchanged");

console.log("all passed");
