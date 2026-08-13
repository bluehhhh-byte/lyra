// `>^N` 병합 번역 — 원문 여러 줄에 번역 하나가 붙는 구조.
// 이게 없으면 파서가 번역을 바로 위 한 줄에만 붙여, 덮인 줄들이 "번역 누락"으로
// 보이고 린트가 매번 거짓 경고를 낸다. 그 회귀가 이 테스트다.
//   node lib/lyrics-span.test.mjs
import assert from "node:assert/strict";
import { parseLyrics } from "./songs.js";

// 기본 `>`는 바로 위 한 줄
{
  const [st] = parseLyrics("A line\n> 한 줄 번역");
  assert.equal(st.lines[0].ko, "한 줄 번역");
  assert.equal(st.lines[0].koSpan, undefined, "평범한 `>`에는 span 표시 없음");
}

// `>^2`는 위 두 줄을 한 번역이 덮는다
{
  const [st] = parseLyrics(
    "I’m a thousand miles away\nBut girl, tonight you look so pretty\n>^2 천 마일이나 떨어져 있지만, 오늘 밤 넌 정말 예뻐 보여"
  );
  assert.equal(st.lines.length, 2, "원문 줄 수는 그대로");
  assert.equal(st.lines[0].ko, "", "덮인 줄에는 번역 문자열을 복제하지 않음");
  assert.equal(st.lines[0].koMerged, true, "덮인 줄 표시");
  assert.equal(st.lines[1].ko, "천 마일이나 떨어져 있지만, 오늘 밤 넌 정말 예뻐 보여");
  assert.equal(st.lines[1].koSpan, 2);
}
console.log("✓ `>`는 한 줄, `>^N`은 위 N줄을 덮음");

// 앞 줄에 이미 번역이 있으면 그 줄은 덮이지 않는다
{
  const [st] = parseLyrics("A\n> 가\nB\nC\n>^2 나다");
  assert.equal(st.lines[0].ko, "가");
  assert.equal(st.lines[0].koMerged, undefined, "이미 번역된 줄은 그대로");
  assert.equal(st.lines[1].koMerged, true);
  assert.equal(st.lines[2].ko, "나다");
}
console.log("✓ 이미 번역된 줄은 덮지 않음");

// 문단(빈 줄)은 경계 — 범위가 문단을 넘으면 오류로 표시하되 파싱은 계속한다
{
  const stanzas = parseLyrics("A\nB\n\nC\n>^3 너무 넓은 범위");
  const target = stanzas[1].lines.at(-1);
  assert.equal(target.koSpanError, true, "문단 밖을 가리키면 오류 표시");
  assert.equal(stanzas[0].lines.length, 2, "앞 문단은 건드리지 않음");
  assert.equal(target.ko, "너무 넓은 범위", "그래도 번역은 살아 있음 — 렌더가 죽지 않아야 한다");
}
console.log("✓ 문단을 넘는 범위는 오류 표시 (파싱은 계속)");

// 독음(`+`)이 사이에 있어도 번역은 원문 줄에 붙는다
{
  const [st] = parseLyrics("夜に駆ける\n+ 요루니카케루\n> 밤을 달리다");
  assert.equal(st.lines[0].reading, "요루니카케루");
  assert.equal(st.lines[0].ko, "밤을 달리다");
}
console.log("✓ 독음 줄과 공존");

console.log("all passed");
