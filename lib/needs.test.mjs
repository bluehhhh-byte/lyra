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

// 한영을 한 줄에 섞어 쓰는 K-pop 줄은 이미 한국어로 읽힌다 — 붙일 번역이 원문과 같아진다
{
  for (const t of ["불을 붙여 brand new", "들어 cup", "When I walk 다 돌아봐", "Life is 모 아님 도"]) {
    const [st] = parseLyrics(t);
    assert.equal(needsKo(st.lines[0], "en"), false, `한영 혼용: ${t}`);
  }
}

// 가사가 아닌 줄 — 화자 표시, 캡션에 같이 적은 관련곡 목록, 숫자 카운트
{
  for (const t of ["(Michael):", "(Both):", "News Man):", "2. Sonic Youth - Stones (2004)",
                   "3. Astor Piazzolla - Oblivion (perf. 조윤경)", "1, 2, 3, 4", "​"]) {
    const [st] = parseLyrics(t);
    if (!st?.lines.length) continue; // 빈 줄로 걸러졌으면 그것대로 맞다
    assert.equal(needsKo(st.lines[0], "en"), false, `가사 아님: ${JSON.stringify(t)}`);
  }
  // 진짜 가사인데 콜론으로 끝나는 줄까지 삼키면 안 된다
  const [st] = parseLyrics("And then she said to me:");
  assert.equal(needsKo(st.lines[0], "en"), true, "문장은 화자 표시가 아니다");
}
console.log("✓ 한영 혼용·비가사 줄 제외");

// 원문보다 번역이 많은 문단 — 어느 번역도 화면에서 사라지면 안 된다.
// 예전에는 자리가 모자란 번역이 마지막 줄을 덮어써서, 원문 두 줄을 세 줄로 옮긴 곳의
// 앞 번역이 통째로 없어졌다(66곡 222줄).
{
  const [st] = parseLyrics("Line one\nLine two\n> 첫 줄 번역\n> 둘째 줄 번역\n> 남는 번역");
  const shown = st.lines.map((l) => l.ko).join(" ");
  for (const t of ["첫 줄 번역", "둘째 줄 번역", "남는 번역"])
    assert.ok(shown.includes(t), `번역이 사라짐: ${t}`);
}

// `>^N`이 문단 줄 수보다 크게 잡혀도 앞선 번역을 잃지 않는다
{
  const [st] = parseLyrics("A\nB\nC\n>^3 첫 번역\n> 둘째 번역\n> 셋째 번역");
  const shown = st.lines.map((l) => l.ko).join(" ");
  for (const t of ["첫 번역", "둘째 번역", "셋째 번역"])
    assert.ok(shown.includes(t), `번역이 사라짐: ${t}`);
}
console.log("✓ 번역은 어떤 경우에도 사라지지 않는다");

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
// 연주곡은 가사에서 뽑을 게 없다 — 가사·키워드·감정을 대기열에 올리지 않는다
{
  const n = songNeeds(song("🗨 연주곡 해설", { instrumental: true, keywords: [], emotion: "" }));
  assert.equal(n.lyrics, 0);
  assert.equal(n.keywords, 0);
  assert.equal(n.emotion, 0);
  const m = songNeeds(song("🗨 가사 미기입", { keywords: [], emotion: "" }));
  assert.equal(m.lyrics, 1, "연주곡이 아니면 그대로 잡힌다");
  assert.equal(m.keywords, 1);
  // 원문이 어디에도 공개되지 않은 곡도 마찬가지 — 채울 수 없는 항목을 대기열에 두지 않는다
  const k = songNeeds(song("🗨 원문 없음", { lyrics_none: "true", keywords: [], emotion: "" }));
  assert.equal(k.lyrics, 0);
  assert.equal(k.keywords, 0);
  assert.equal(k.emotion, 0);
}
console.log("✓ 곡 단위 집계");

console.log("all passed");
