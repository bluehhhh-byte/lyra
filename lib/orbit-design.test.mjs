// 정서 지도의 설계 결정을 고정한다.
//
// 그림은 단위 테스트로 검증할 수 없다. 대신 "왜 이렇게 그렸는가"에 해당하는
// 결정만 소스에서 확인한다. 되돌리면 실패하고, 실패 메시지가 이유를 말한다.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const orbit = await readFile(new URL("../app/archive/orbit.js", import.meta.url), "utf8");
const page = await readFile(new URL("../app/archive/page.js", import.meta.url), "utf8");

// 척도 — 연도 비교
assert.match(orbit, /const DOMAIN = \[-3, 3\]/, "연도별 비교를 위해 축은 고정 척도여야 한다");
assert.doesNotMatch(orbit, /axisRange\(points/, "데이터에 따른 자동 확대를 다시 사용하면 안 된다");
assert.match(orbit, /\[-2, -1, 1, 2\]\.map/, "좌표 거리감을 읽을 보조 눈금이 있어야 한다");
assert.match(orbit, /grid grid-cols-3 divide-x/, "선택 월의 감정·좌표·기록량을 그래프 밖에서 요약해야 한다");
assert.match(page, /년의 정서 지도/, "그래프 이름이 좌표의 의미를 직접 설명해야 한다");

// 색 = 시간.
// valence는 이미 가로축이다. 점까지 valence 색으로 칠하면 같은 값을 두 채널에
// 그리는 셈이라 색이 아무 새 정보도 싣지 않고, "언제"는 화살표를 눈으로 따라가야만
// 읽혔다. 색을 시간에 내주면 궤적이 색만으로 읽힌다.
{
  assert.match(orbit, /function timeColor\(/, "시간 순서를 나타내는 색 함수가 있어야 한다");
  const dot = orbit.match(/<circle\s+cx=\{cx\} cy=\{cy\} r=\{r\(s\)\}[\s\S]*?\/>/);
  assert.ok(dot, "월 점을 그리는 circle을 찾지 못했다");
  assert.match(dot[0], /fill=\{timeColor\(/, "월 점 색은 시간 순서여야 한다");
  assert.doesNotMatch(dot[0], /valenceColor/, "가로축이 이미 valence다 — 점 색까지 쓰면 같은 값을 두 번 그린다");
  assert.match(
    orbit,
    /점 색은 시간 순서다/,
    "색이 무엇을 뜻하는지 화면에 적어야 한다 — 범례 없는 색은 장식이다"
  );
}

// 마크 크기 — 점이 판 가운데 뭉치므로 작아야 한다.
// 40개월 중 37개가 ±1.5 안에 있는데 척도는 −3~+3이다.
{
  const variants = orbit.match(/const VARIANTS = \{[\s\S]*?\n\};/);
  assert.ok(variants, "VARIANTS를 찾지 못했다");
  const radii = [...variants[0].matchAll(/rBase: ([\d.]+), rMax: ([\d.]+)/g)];
  assert.ok(radii.length >= 2, "모바일·데스크톱 두 좌표계가 있어야 한다");
  for (const [, base, max] of radii) {
    assert.ok(
      Number(base) + Number(max) <= 6.5,
      `점 최대 반지름이 ${Number(base) + Number(max)}이다 — 마크가 크면 가운데 뭉친 점끼리 겹쳐 읽히지 않는다`
    );
  }
}

// 이동선은 점보다 뒤에 있어야 한다 — 선이 앞서면 점이 아니라 선을 읽게 된다
{
  const move = orbit.match(/markerEnd=\{`url\(#\$\{chartId\}-arrow\)`\} opacity="([\d.]+)"/);
  assert.ok(move, "이동선 opacity를 찾지 못했다");
  assert.ok(Number(move[1]) < 0.8, `이동선 opacity가 ${move[1]}이다 — 데이터 점보다 뒤에 있어야 한다`);
}

// 시간축 그림 — 지도만으로는 "언제 어떻게 움직였나"가 읽히지 않는다.
// 고정 척도 탓에 이동 폭이 작아 보이는 문제를 시간축이 값 범위와 무관하게 편다.
{
  assert.match(orbit, /export function EmotionTrend\(/, "시간축 추이 그림이 있어야 한다");
  assert.match(page, /<EmotionTrend/, "추이 그림이 아카이브 화면에 놓여야 한다");
  assert.match(orbit, /length: 12/, "기록이 없는 달도 자리를 차지해야 공백이 공백으로 보인다");
  assert.match(
    orbit,
    /기록이 없는 달은 선을 잇지 않는다/,
    "빈 달을 이어 그리면 없는 값을 있는 것처럼 보이게 한다"
  );
}

console.log("✓ 정서 지도 — 고정 척도 · 색은 시간 · 작은 마크 · 시간축 추이");
