import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../app/songs/[slug]/lyrics-view.js", import.meta.url), "utf8");

test("bilingual lyric lines expose source and translation languages", () => {
  assert.match(source, /lang=\{lang \|\| "en"\}/);
  assert.match(source, /lang="ko"/);
  assert.match(source, /lang="en"/);
  assert.match(source, />한국어 번역: <\/span>/);
  assert.match(source, />영어 번역: <\/span>/);
});

test("translation points back to its source line when both are visible", () => {
  assert.match(source, /id=\{`lyric-\$\{i\}-\$\{j\}-original`\}/);
  assert.match(source, /aria-describedby=\{mode === "both" \? `lyric-\$\{i\}-\$\{j\}-original` : undefined\}/);
  // 속성이 한 줄에 있는지가 아니라 둘 다 붙어 있는지가 계약이다 — 독음 칸을
  // 넣으며 태그가 여러 줄로 나뉘었을 뿐 스크린리더가 읽는 것은 그대로다.
  assert.match(source, /role="group"/);
  assert.match(source, /aria-label="원문과 번역"/);
});

test("lyric display modes use concise Korean labels", () => {
  assert.match(source, /key: "both", label: "전체"/);
  assert.match(source, /key: "orig", label: "원문"/);
  assert.match(source, /key: "trans", label: "번역"/);
});
