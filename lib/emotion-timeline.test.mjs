import assert from "node:assert/strict";
import fs from "node:fs";

// 일자별 감정 차트의 계약. 예전에는 기록이 있는 날마다 점을 찍어 567개가 720
// 단위 판에 들어갔다 — 점 지름 13.7px에 간격 1.6px이라 이웃을 여덟 겹으로 덮었다.
// 점은 달마다 하나, 일별 값은 선이 맡는다.
const source = fs.readFileSync(new URL("../app/emotion-timeline.js", import.meta.url), "utf8");

assert.match(source, /const marks = months\.map/, "점은 월 단위로 모은 뒤 찍는다");
assert.match(source, /marks\.map\(\(m, index\) => \(/, "점 렌더는 일별이 아니라 월별 배열을 돈다");
assert.doesNotMatch(source, /pts\.map\(\(d, i\) => \(\s*<g/, "일별 점을 다시 그리면 안 된다 — 그게 겹침의 원인이었다");
assert.match(source, /<path d=\{line\}/, "일별 값은 선으로 남아야 한다 — 해상도를 잃지 않는 유일한 방법");

// 라벨은 고정 규칙(격월 등)이 아니라 실제 거리로 솎아야 한다. 달마다 기록
// 일수가 달라 점 간격이 고르지 않기 때문이다.
assert.match(source, /LABEL_MIN_GAP/, "라벨 최소 간격을 값으로 둔다");
assert.match(source, /at - lastLabelX >= LABEL_MIN_GAP/, "직전 라벨과의 실제 거리로 판정한다");
assert.match(source, /labelled\.delete\(lastLabelKey\)/, "연도 라벨을 강제로 놓을 때 앞 라벨을 거두지 않으면 그 자리가 겹친다");

// 데이터가 모자란 상태는 그대로 유지 — 없는 걸 그리지 않는다
assert.match(source, /pts\.length < 2/, "이틀 미만이면 곡선을 그리지 않는다");

console.log("emotion timeline contract passed");
