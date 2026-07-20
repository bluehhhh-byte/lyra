// Smallest thing that fails if the markdown parser breaks.
//   node lib/songs.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lyra-"));
fs.mkdirSync(path.join(dir, "songs"));

const SONG = [
  "---",
  "title: Test Song",
  "artist: Tester",
  "lang: ja",
  "tags: [일본, 2010s, 그리움]",
  "date: 2026-01-01",
  "---",
  "[Verse 1]",
  "original line",
  "+ 독음",
  "> 번역",
  "// 해설 노트",
  "",
  "[Chorus]",
  "second stanza",
  "",
].join("\n");

const check = (label, raw) => {
  fs.writeFileSync(path.join(dir, "songs", "t.md"), raw);
  process.chdir(dir);
  // fresh import per run — lib/songs.js reads cwd at module load
  const url = new URL("./songs.js", import.meta.url).href + `?${label}`;
  return import(url).then(({ getAllSongs, getAllTags }) => {
    const [s] = getAllSongs();
    assert.equal(s.title, "Test Song", `${label}: title`);
    assert.equal(s.artist, "Tester", `${label}: artist`);
    assert.deepEqual(s.tags, ["일본", "2010s", "그리움"], `${label}: tags`);
    assert.deepEqual(getAllTags(), ["2010s", "그리움", "일본"], `${label}: getAllTags`);

    assert.equal(s.stanzas.length, 2, `${label}: stanza count`);
    const [v1, chorus] = s.stanzas;
    assert.equal(v1.section, "Verse 1", `${label}: section`);
    assert.equal(v1.note, "해설 노트", `${label}: note`);
    assert.deepEqual(v1.lines, [{ en: "original line", ko: "번역", reading: "독음" }], `${label}: lines`);
    assert.equal(chorus.section, "Chorus", `${label}: second section`);
    console.log(`✓ ${label}`);
  });
};

const root = process.cwd();
await check("LF", SONG);
process.chdir(root);
await check("CRLF", SONG.replace(/\n/g, "\r\n")); // git autocrlf checkout on Windows
process.chdir(root);

// Hand-typed English lyrics get capitalized per line; everything else is left alone.
const { capitalizeLyricLines } = await import(new URL("./songs.js", import.meta.url).href);
const cap = (input, want, label) => {
  assert.equal(capitalizeLyricLines(input), want, label);
  console.log(`✓ cap: ${label}`);
};
cap("dress cut down to there", "Dress cut down to there", "plain line");
cap("That there", "That there", "already capitalized — untouched");
cap("'cause I'm not here", "'Cause I'm not here", "apostrophe elision");
cap("(ooh) and away", "(Ooh) and away", "parenthetical");
cap("> the way we are", "> The way we are", "English translation under a Korean line");
cap("+ 유메나라바", "+ 유메나라바", "Korean reading — caseless, no-op");
cap("夢ならば\n> 꿈이라면", "夢ならば\n> 꿈이라면", "Japanese + Korean — no-op");
cap("[verse 1]\ni go", "[Verse 1]\nI go", "section header and following line");
cap("1 2 3 go", "1 2 3 go", "leading digit — untouched");
cap("a\n\nb", "A\n\nB", "blank line preserved");

fs.rmSync(dir, { recursive: true, force: true });
console.log("all passed");
