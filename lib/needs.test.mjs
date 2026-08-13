// 무엇이 '부족한' 줄인지 판정하는 규칙 — 화면·린트·자동수정이 같은 답을 내야 한다.
// 이 규칙이 어긋나서 실제로 두 번 사고가 났다:
//  1) 관리자 형식검사가 이미 해결된 줄까지 세어 214곡을 고치라고 했다
//  2) 자동수정이 🗨 해설을 가사로 보고 번역을 붙였고, `>^N`이 덮은 줄에 번역을
//     또 붙여 범위가 어긋났다
//   node lib/needs.test.mjs
import assert from "node:assert/strict";
import { parseLyrics } from "./songs.js";
import { needsKo, needsReadingLine, isNoteLine, songNeeds } from "./admin/needs.js";

const song = (body, extra = {}) => ({ stanzas: parseLyrics(body), tags: [], keywords: ["밤"], emotion: "고독", comment: "c", title_ko: "t", artwork: "https://x/y.jpg", year: "2020", ...extra });

// 해설 줄은 가사가 아니다 — 번역 대상도, 독음 대상도 아니다
{
  assert.ok(isNoteLine("🗨 이 곡은 …"));
  assert.ok(isNoteLine("✏ 메모"));
  const [st] = parseLyrics("🗨 이 곡에 대한 해설");
  assert.equal(st.lines.length, 0, "해설은 가사 줄로 세지 않는다");
  assert.ok(st.note, "해설은 연 노트로 간다");
}

// `>^N`이 덮은 줄은 번역이 없는 게 아니다
{
  const [st] = parseLyrics("A line\nAnother line\n>^2 두 줄을 한 번에 옮긴 번역");
  assert.equal(needsKo(st.lines[0], "en"), false, "덮인 줄은 번역 대상이 아니다");
  assert.equal(needsKo(st.lines[1], "en"), false);
}

// 외국곡 안의 한국어 가사에 한글 번역을 붙일 이유가 없다
{
  const [st] = parseLyrics("우리 함께 걸었던 길");
  assert.equal(needsKo(st.lines[0], "en"), false, "이미 한글인 줄은 번역 대상이 아니다");
}

// 진짜 빠진 줄은 잡는다
{
  const [st] = parseLyrics("A line with no translation");
  assert.equal(needsKo(st.lines[0], "en"), true);
}

// 한국어 곡의 `>`는 영어 번역이라 이 기준으로 세지 않는다
{
  const [st] = parseLyrics("아무 말도 없이");
  assert.equal(needsKo(st.lines[0], "ko"), false);
}

// 독음은 일본어 줄에만, 이미 있으면 아니다
{
  const [st] = parseLyrics("夜に駆ける\n街の灯り\n+ 마치노 아카리");
  assert.equal(needsReadingLine(st.lines[0]), true);
  assert.equal(needsReadingLine(st.lines[1]), false, "이미 독음이 있으면 대상이 아니다");
}
console.log("✓ 번역·독음·해설 판정");

// 곡 단위 집계 — 해설만 있는 글은 '가사 없음'으로 잡힌다
{
  const n = songNeeds(song("🗨 가사 없이 해설만 적은 글"));
  assert.equal(n.lyrics, 1);
  assert.equal(n.translation, 0, "해설을 번역 대상으로 세지 않는다");
}
{
  const n = songNeeds(song("Line one\n> 한 줄 번역", { lang: "en" }));
  assert.equal(n.translation, 0);
  assert.equal(n.lyrics, 0);
}
console.log("✓ 곡 단위 집계");

console.log("all passed");
