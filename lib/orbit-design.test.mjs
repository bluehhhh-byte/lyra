// 정서 지도의 설계 결정을 고정한다.
//
// 그림은 단위 테스트로 검증할 수 없다. 대신 "왜 이렇게 그렸는가"에 해당하는
// 결정만 소스에서 확인한다. 되돌리면 실패하고, 실패 메시지가 이유를 말한다.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const orbit = await readFile(new URL("../app/archive/orbit.js", import.meta.url), "utf8");
const page = await readFile(new URL("../app/archive/archive-view.js", import.meta.url), "utf8");

// 단일 연도 지도는 움직임을 확대하고, 별도 연도 비교 그래프만 고정 척도를 쓴다.
assert.match(orbit, /const DOMAIN = \[-3, 3\]/, "연도별 비교를 위해 축은 고정 척도여야 한다");
assert.match(orbit, /const ORBIT_MIN_SPAN = 1\.8/, "월별 이동 차이를 키우되 최소 좌표 폭으로 과장을 제한해야 한다");
assert.match(orbit, /axisRange\(points[\s\S]*minSpan: ORBIT_MIN_SPAN/, "정서 지도는 한 해의 데이터 범위를 넓게 써야 한다");
assert.doesNotMatch(orbit, /OrbitScaleToggle|움직임 확대|전체 척도/, "정서 지도는 보기 전환 없는 단일 그래프여야 한다");
assert.match(orbit, /const GRID_TICKS = \[-2, -1, -0\.5, 0\.5, 1, 2\]/, "좌표 거리감을 읽을 보조 눈금이 있어야 한다");
assert.match(orbit, /grid grid-cols-2[\s\S]*sm:grid-cols-4/, "선택 월의 감정·좌표·기록량·이동을 그래프 밖에서 요약해야 한다");
assert.match(page, /년의 정서 지도/, "그래프 이름이 좌표의 의미를 직접 설명해야 한다");

// 색 = 시간, 별 실루엣 = 다섯 월별 지표.
{
  assert.match(orbit, /function timeColor\(/, "시간 순서를 나타내는 색 함수가 있어야 한다");
  assert.match(orbit, /const STAR_AXIS_LABELS = \["각성", "밝기", "다양성", "기록 밀도", "전월 이동"\]/, "별의 다섯 꼭짓점에 고정된 의미가 있어야 한다");
  assert.match(orbit, /function starProfiles\(/, "월별 다섯 축 프로필을 계산해야 한다");
  assert.match(orbit, /function starPoints\(/, "다섯 꼭짓점과 다섯 골을 가진 별을 그려야 한다");
  const star = orbit.match(/<polygon[\s\S]*?className="orbit-star"[\s\S]*?\/>/);
  assert.ok(star, "월별 별 polygon을 찾지 못했다");
  assert.match(star[0], /fill=\{timeColor\(/, "월별 별 색은 시간 순서여야 한다");
  assert.match(orbit, /별·선 · 약 1\.2초 간격 순차 재생/, "별과 재생 속도를 화면에 적어야 한다");
  assert.match(orbit, /주황 링 · 직전 연속 월 대비 좌표 1\.25 이상 이동/, "전환점 링의 판정 기준을 화면에서 설명해야 한다");
}

// 월 점은 모두 보여 주되 넓은 판과 충돌 회피 배치로 읽는다.
{
  assert.doesNotMatch(orbit, /showLabel/, "1월부터 12월까지 모든 월 라벨이 순차적으로 나타나야 한다");
  assert.match(orbit, /className="orbit-point"/, "점과 월 라벨을 함께 나타내는 애니메이션 그룹이 있어야 한다");
  assert.match(orbit, /r=\{starSize \+ 8\} fill="transparent"/, "별도 키보드·포인터로 고를 수 있는 충분한 클릭 영역이 있어야 한다");
  assert.match(orbit, /i === 0[\s\S]*orbit-start-halo[\s\S]*시작/, "첫 달은 시작점으로 분명하게 표시해야 한다");
}

// 작은 수치 차이는 별 실루엣의 25~100% 길이에 펼치되 실제 수치는 그대로 남긴다.
{
  assert.match(orbit, /const STAR_RADIUS_FLOOR = 0\.25/, "별의 짧은 꼭짓점도 형태를 알아볼 최소 길이가 있어야 한다");
  assert.match(orbit, /Math\.pow\(t, 0\.82\)/, "월별 상대 차이를 별 모양에서 분명하게 벌려야 한다");
  assert.match(orbit, /그해 최솟값~최댓값을 25~100% 길이로 펼쳐/, "상대 확대라는 사실을 화면에서 설명해야 한다");
}

// 시간 색은 명도가 아니라 색상으로 갈라야 한다.
//
// 한 색상 안에서 흐림→또렷함으로 가면 이웃한 달이 구분되지 않는다. 명도로 폭을
// 벌리는 것도 답이 아니다 — 다크(#0d0d0f)와 라이트(#fdfdfc)를 모두 쓰므로
// 어두운 끝은 다크에서, 밝은 끝은 라이트에서 묻힌다.
{
  const from = Number(orbit.match(/const TIME_HUE_FROM = (\d+)/)?.[1]);
  const to = Number(orbit.match(/const TIME_HUE_TO = (\d+)/)?.[1]);
  assert.ok(Number.isFinite(from) && Number.isFinite(to), "시간 색상 범위를 찾지 못했다");
  assert.ok(
    Math.abs(from - to) >= 120,
    `색상 폭이 ${Math.abs(from - to)}도다 — 이웃한 달이 구분되려면 충분히 돌아야 한다`
  );

  const light = orbit.match(/const lightness = ([\d.]+) \+ t \* ([\d.]+)/);
  assert.ok(light, "시간 색 명도 식을 찾지 못했다");
  const lo = Number(light[1]);
  const hi = lo + Number(light[2]);
  assert.ok(lo >= 0.55, `가장 어두운 색의 명도가 ${lo}다 — 다크 배경에서 묻힌다`);
  assert.ok(hi <= 0.85, `가장 밝은 색의 명도가 ${hi}다 — 라이트 배경에서 묻힌다`);

  assert.match(orbit, /timeStops\(/, "범례는 중간 색까지 보여야 한다 — 양 끝만 이으면 실제와 다르게 보간된다");
}

// 별은 형태가 읽히면서도 서로를 덮지 않는 크기여야 한다.
{
  const variants = orbit.match(/const VARIANTS = \{[\s\S]*?\n\};/);
  assert.ok(variants, "VARIANTS를 찾지 못했다");
  const starSizes = [...variants[0].matchAll(/starSize: (\d+)/g)].map((m) => Number(m[1]));
  assert.equal(starSizes.length, 2, "모바일·데스크톱 두 별 크기가 있어야 한다");
  for (const size of starSizes) {
    assert.ok(size >= 16 && size <= 22, `별 크기 ${size}는 형태 가독성과 겹침 제한 범위를 벗어났다`);
  }

  // 판이 커야 라벨이 놓일 자리가 생긴다
  // `labelH:`가 아니라 좌표계 높이 `H:`만 — 앞에 공백이나 쉼표가 오는 쪽이다
  const heights = [...variants[0].matchAll(/[{,]\s*H: (\d+)/g)].map((m) => Number(m[1]));
  for (const h of heights) {
    assert.ok(h >= 420, `판 높이가 ${h}이다 — 라벨이 겹치지 않으려면 판이 넓어야 한다`);
  }
  const desktopWidth = Number(variants[0].match(/desktop: \{ key: "d", W: (\d+)/)?.[1]);
  assert.ok(desktopWidth >= 900, `데스크톱 판 폭이 ${desktopWidth}이다 — 월 이동을 넓게 보이려면 900 이상이어야 한다`);
}

// 이동 거리가 클수록 선도 굵어져 공간 차이를 한 번 더 드러낸다.
{
  assert.match(orbit, /const moveWidth = aw \+ Math\.min\(1\.3, \(s\.prev\?\.distance \|\| 0\) \* 0\.55\)/, "큰 이동은 더 굵은 선으로 보여야 한다");
  assert.match(orbit, /const opacity = 0\.72/, "이동선은 점보다 한 단계 뒤에 있어야 한다");
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
  assert.ok(
    page.indexOf("sm:hidden") < page.indexOf("<EmotionOrbit"),
    "모바일에서는 월별 추이를 정서 지도보다 먼저 보여야 한다"
  );
}

console.log("✓ 정서 지도 — 단일 확대 판 · 월별 순차 이동 · 넓은 그래프");
