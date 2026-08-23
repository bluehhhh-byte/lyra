import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const orbit = await readFile(new URL("../app/archive/orbit.js", import.meta.url), "utf8");
const page = await readFile(new URL("../app/archive/page.js", import.meta.url), "utf8");

assert.match(orbit, /const DOMAIN = \[-3, 3\]/, "연도별 비교를 위해 축은 고정 척도여야 한다");
assert.match(orbit, /\[-2, -1, 1, 2\]\.map/, "좌표 거리감을 읽을 보조 눈금이 있어야 한다");
assert.match(orbit, /grid grid-cols-3 divide-x/, "선택 월의 감정·좌표·기록량을 그래프 밖에서 요약해야 한다");
assert.match(orbit, /opacity="0\.42"/, "이동선은 데이터 점보다 시각적으로 뒤에 있어야 한다");
assert.match(page, /년의 정서 지도/, "그래프 이름이 좌표의 의미를 직접 설명해야 한다");
assert.doesNotMatch(orbit, /axisRange\(points/, "데이터에 따른 자동 확대를 다시 사용하면 안 된다");

console.log("✓ 정서 지도 — 고정 척도·영역·선택 월 요약");
