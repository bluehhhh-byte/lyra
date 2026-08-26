import assert from "node:assert/strict";
import fs from "node:fs";

const view = fs.readFileSync(new URL("../app/songs/[slug]/lyrics-view.js", import.meta.url), "utf8");
assert.match(view, /<aside role="note" aria-label="이 연에 대한 해설"/, "해설은 가사 문단이 아닌 note 의미를 가져야 한다");
assert.match(view, /mt-8 border-l-2 border-accent\/60 bg-accent\/5/, "해설은 충분한 간격·경계·배경으로 분리한다");
assert.match(view, />연 해설<\/span>/, "화면에서도 해설임을 명시한다");
console.log("✓ 연 해설은 의미와 시각 모두 가사에서 분리");
