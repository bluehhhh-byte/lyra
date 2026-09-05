import assert from "node:assert/strict";
import fs from "node:fs";

const view = fs.readFileSync(new URL("../app/songs/[slug]/lyrics-view.js", import.meta.url), "utf8");

// 이 상자에 담기는 것은 대개 가사 분석이 아니라 소유자가 남긴 기록이다 —
// 곡을 고른 날의 이야기, 인물·배경 설명. 112곡 188줄 중 대부분이 그렇다.
// '연 해설'이라 부르면 가사 풀이처럼 읽혀 오해를 부른다.
assert.match(view, /<aside role="note" aria-label="이 연에 남긴 노트"/, "노트는 가사 문단이 아닌 note 의미를 가져야 한다");
assert.match(view, /mt-8 border-l-2 border-accent\/60 bg-accent\/5/, "노트는 충분한 간격·경계·배경으로 가사와 분리한다");
assert.match(view, />노트<\/span>/, "화면에서도 가사가 아님을 명시한다");
assert.doesNotMatch(view, />연 해설<\/span>/, "가사 풀이로 읽히는 이름으로 되돌아가면 안 된다");

console.log("✓ 연 노트는 의미와 시각 모두 가사에서 분리");
