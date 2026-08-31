// 정서 지도의 핵심 설계 결정을 소스 수준에서 고정한다.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const orbit = await readFile(new URL("../app/archive/orbit.js", import.meta.url), "utf8");
const comparison = await readFile(new URL("../app/archive/orbit-month-comparison.js", import.meta.url), "utf8");
const page = await readFile(new URL("../app/archive/archive-view.js", import.meta.url), "utf8");

// 화면은 월 두 개를 직접 골라 같은 큰 별 축에서 비교한다.
assert.match(orbit, /<OrbitMonthComparison points=\{points\}/, "월 비교 그래프를 렌더링해야 한다");
assert.match(comparison, /\[0\.25, 0\.5, 0\.75, 1\]/, "큰 별의 단계별 눈금이 있어야 한다");
assert.doesNotMatch(orbit, /<OrbitChart points=\{points\}/, "작은 별 마커 좌표판을 렌더링하면 안 된다");
assert.doesNotMatch(orbit, /OrbitScaleToggle|움직임 확대|전체 척도/, "보기 전환 없는 단일 그래프여야 한다");
assert.match(comparison, /기준 월 선택/);
assert.match(comparison, /비교 월 선택/);
assert.match(comparison, /aria-pressed=\{selected\}/, "선택 상태를 보조 기술에 전달해야 한다");
// 두 별 모두 실선이다 — 기준 월만 점선이던 시절, 비교 월의 면 채움과 굵은 획이
// 점선을 덮어 겹치는 구간에서 기준 월이 사라졌다. 계열 구분은 선 굵기와
// 꼭짓점 마커(기준=빈 원, 비교=찬 원)가 담당한다.
assert.match(comparison, /data-series="base"[\s\S]*fill="none"[\s\S]*stroke=\{baseColor\}/, "기준 월은 채움 없는 감정색 실선이어야 한다");
assert.doesNotMatch(comparison, /data-series="(base|compare)"[\s\S]{0,300}strokeDasharray/, "월 별에 점선을 다시 들이지 말 것 — 겹침에서 가려진다");
assert.match(comparison, /data-series="compare"[\s\S]*stroke=\{compareColor\}/, "비교 월은 감정색 실선이어야 한다");
assert.match(comparison, /shapeProfiles\[baseIndex\]\.map[\s\S]{0,200}fill="var\(--color-surface\)" stroke=\{baseColor\}/, "기준 월 꼭짓점은 빈 원 마커여야 한다");
assert.match(comparison, /shapeProfiles\[compareIndex\]\.map[\s\S]{0,200}fill=\{compareColor\}/, "비교 월 꼭짓점은 찬 원 마커여야 한다");
assert.match(comparison, /emotionColor\(base\)/);
assert.match(comparison, /emotionColor\(compare\)/);
assert.match(orbit, /별 색상 · 대표 감정 \+ 밝고 어두운 기운 \+ 에너지/);
assert.match(comparison, /<MonthSummary title="기준"/);
assert.match(comparison, /<MonthSummary title="비교"/);
assert.match(page, /년의 정서 지도/, "그래프 영역의 이름이 있어야 한다");
assert.match(page, /두 달을 골라 밝은 기운·에너지·감정의 폭·어두운 깊이·잔잔한 여운을 비교한다/);

assert.match(comparison, /EMOTION_PROFILE_AXES/);
assert.match(comparison, /points\.map\(\(point\) => emotionProfile\(point\)\)/);
assert.match(comparison, /function starPoints\([\s\S]*length: 10/, "다섯 꼭짓점과 다섯 골을 가진 별이어야 한다");

// 작은 수치 차이를 상대 길이로 펼치되, 그 사실과 실제 값 확인 위치를 명시한다.
assert.match(orbit, /별 꼭짓점 · 밝은 기운→강한 에너지→감정의 폭→어두운 깊이→잔잔한 여운/);
// 지표는 0~1000이다 — 0~100은 달 사이 차이가 한두 자리에 머물러 변별이 안 됐다.
// 축 스케일도 실사용 범위 ±2다(±3 기준은 값이 33~66 구간에 뭉친다).
assert.match(orbit, /모든 달에 동일한 0~1000 기준/);
assert.match(comparison, /별 그래프 다섯 축 설명/);
assert.match(comparison, /Math\.round\(scores\[index\] \* EMOTION_PROFILE_MAX\)/);
const profile = await readFile(new URL("./emotion-profile.js", import.meta.url), "utf8");
assert.match(profile, /EMOTION_PROFILE_MAX = 1000/);
assert.match(profile, /AXIS_LIM = 2/, "축 스케일은 실사용 범위 ±2여야 한다");

// 긴 한글 축 이름이 잘리지 않도록 모바일도 넓은 안전 여백을 확보한다.
assert.match(comparison, /width: 420, height: 450, cx: 210, cy: 222, radius: 128/);
assert.match(comparison, /width: 900, height: 510, cx: 450, cy: 250, radius: 184/);

// 실제 절대 좌표는 별 그래프와 별개의 고정 척도 연도 비교에서 보존한다.
assert.match(orbit, /const DOMAIN = \[-3, 3\]/);
assert.match(orbit, /export function YearComparison\(/);

// 기록이 없는 달은 시간축에서도 값이 있는 것처럼 이어 그리지 않는다.
assert.match(orbit, /export function EmotionTrend\(/);
assert.match(page, /<EmotionTrend/);
assert.match(orbit, /기록이 없는 달은 선을 잇지 않는다/);

console.log("✓ 정서 지도 — 두 월 직접 선택 · 큰 별 중첩 비교 · 한글 라벨 안전 여백");
