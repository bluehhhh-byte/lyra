import assert from "node:assert/strict";
import fs from "node:fs";

// 가사는 운문이라 줄이 짧다 — 672px 열에서 가장 긴 줄이 358px였고 오른쪽 절반이
// 늘 비어 있었다. 독음은 원문의 보조인데 세로로 쌓여 있어 줄 수를 두 배로 만들고
// 위계도 원문과 같아 보였다. 빈 오른쪽으로 옮기면 둘 다 풀린다.
const view = fs.readFileSync(new URL("../app/songs/[slug]/lyrics-view.js", import.meta.url), "utf8");

assert.match(view, /const readingGutter = \(stanza, showReadings, mode\)/, "여백을 열지 말지는 한 곳에서 판정한다");
assert.match(view, /stanza\.lines\.some\(\(line\) => line\.reading\)/, "독음이 실제로 있는 연에만 칸을 나눈다 — 없으면 원문 폭만 줄어든다");
assert.match(view, /sm:grid-cols-\[minmax\(0,1fr\)_11rem\]/, "독음 칸은 고정 폭, 원문은 남는 폭 전부");
assert.match(view, /sm:items-baseline/, "독음은 원문과 같은 기준선에서 읽혀야 한다");

// 좁은 화면에는 나눌 폭이 없다 — sm: 접두사가 빠지면 모바일에서 176px을 뺏긴다
const gridClass = view.match(/lyric-line \$\{[^}]*\? "([^"]*)"/)?.[1] || "";
for (const token of gridClass.split(" ").filter(Boolean)) {
  assert.ok(token.startsWith("sm:"), `독음 칸 스타일은 전부 sm: 이상이어야 한다 (${token})`);
}

// 독음은 원문·번역을 감싼 칸 밖에 있어야 오른쪽으로 간다
const lineBlock = view.slice(view.indexOf('role="group"'), view.indexOf("translationMissing") + 600);
assert.ok(
  lineBlock.indexOf("line.reading") > lineBlock.indexOf("translationMissing"),
  "독음은 원문·번역 묶음 다음에 와야 그리드의 둘째 칸이 된다",
);

console.log("reading gutter contract passed");
