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
const { capitalizeLyricLines, isSectionLabel, parseLyrics } = await import(new URL("./songs.js", import.meta.url).href);
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
cap("ﬁre and rain", "ﬁre and rain", "ﬁ ligature — left alone, never 'FIre'");
cap("𐐨 deseret", "𐐀 deseret", "astral-plane letter still capitalizes");

// 구간 라벨은 길이가 아니라 꼴로 가린다. 부른 사람이 둘이면 24자를 쉽게 넘는데,
// 길이로 먼저 자르면 라벨이 가사 한 줄이 되어 "번역 필요"로 대기열에 오른다 —
// Post Malone <Take What You Want>의 `[Chorus: Ozzy Osbourne & Post Malone]`(35자)이
// 그랬다.
{
  for (const label of [
    "Chorus: Ozzy Osbourne & Post Malone",
    "Verse 1: Post Malone",
    "Verse 4: Travis Scott",
    "Pre-Chorus: A, B & C",
    "Chorus",
    "Verse 2",
    "후렴",
  ]) assert.ok(isSectionLabel(label), `라벨이어야 한다: ${label}`);

  // 구간 낱말로 시작해도 라벨 꼴이 아니면 가사다 — 예전에는 \b만 보고 삼켰다
  for (const lyric of [
    "Drop it like it's hot and never look back",
    "Hook me up with someone new",
    "人はいったいどこから來て",
  ]) assert.ok(!isSectionLabel(lyric), `가사여야 한다: ${lyric}`);

  // 화자 이름은 그대로 라벨로 남는다
  for (const name of ["Rumi", "Jinu", "Michael"]) assert.ok(isSectionLabel(name), name);

  // 실제 파싱까지 확인 — 라벨이 가사 줄로 새면 줄 수가 늘어난다
  const stanzas = parseLyrics("[Chorus: Ozzy Osbourne & Post Malone]\nTake what you want\n> 원하는 걸 가져가");
  assert.equal(stanzas[0].section, "Chorus: Ozzy Osbourne & Post Malone");
  assert.equal(stanzas[0].lines.length, 1, "라벨이 가사 줄로 새면 안 된다");
}
console.log("✓ 구간 라벨 — 부른 사람이 붙어 길어져도 라벨이다");

fs.rmSync(dir, { recursive: true, force: true });
console.log("all passed");
