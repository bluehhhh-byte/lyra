// 정서 지도의 핵심 설계 결정을 소스 수준에서 고정한다.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const orbit = await readFile(new URL("../app/archive/orbit.js", import.meta.url), "utf8");
const page = await readFile(new URL("../app/archive/archive-view.js", import.meta.url), "utf8");

// 화면은 별 모양 점을 흩어 놓은 좌표판이 아니라 하나의 큰 다섯 축 별 그래프다.
assert.match(orbit, /function StarOrbitChart\(/, "정서 지도는 큰 별 그래프여야 한다");
assert.match(orbit, /const gridLevels = \[0\.25, 0\.5, 0\.75, 1\]/, "큰 별의 단계별 눈금이 있어야 한다");
assert.match(orbit, /<StarOrbitChart points=\{points\}/, "화면은 큰 별 그래프를 렌더링해야 한다");
assert.doesNotMatch(orbit, /<OrbitChart points=\{points\}/, "작은 별 마커 좌표판을 렌더링하면 안 된다");
assert.doesNotMatch(orbit, /OrbitScaleToggle|움직임 확대|전체 척도/, "보기 전환 없는 단일 그래프여야 한다");
assert.match(orbit, /grid grid-cols-2[\s\S]*sm:grid-cols-4/, "선택 월의 실제 수치를 그래프 밖에서 요약해야 한다");
assert.match(page, /년의 정서 지도/, "그래프 영역의 이름이 있어야 한다");

// 다섯 꼭짓점은 월별 지표이고, 같은 중심에서 이전 달 잔상과 현재 달을 비교한다.
assert.match(orbit, /const STAR_AXIS_LABELS = \["각성", "밝기", "다양성", "기록 밀도", "전월 이동"\]/);
assert.match(orbit, /function starProfiles\(/);
assert.match(orbit, /function starPoints\([\s\S]*length: 10/, "다섯 꼭짓점과 다섯 골을 가진 별이어야 한다");
assert.match(orbit, /className="orbit-radar-shape"/, "월별 큰 별 실루엣이 있어야 한다");
assert.match(orbit, /className="orbit-month-shape"/, "월별 큰 별을 순차 표시해야 한다");
assert.match(orbit, /--orbit-shape-opacity[\s\S]*active \? 0\.95 : 0\.2/, "현재 월은 진하게, 이전 월은 잔상으로 남아야 한다");
assert.match(orbit, /\{mm\(points\[0\]\.month\)\} · 시작/, "첫 달을 시작으로 표시해야 한다");
assert.match(orbit, /\{mm\(month\)\} · 현재/, "선택 월을 현재로 표시해야 한다");

// 작은 수치 차이를 상대 길이로 펼치되, 그 사실과 실제 값 확인 위치를 명시한다.
assert.match(orbit, /const STAR_RADIUS_FLOOR = 0\.25/);
assert.match(orbit, /Math\.pow\(t, 0\.82\)/);
assert.match(orbit, /하나의 큰 별이 월마다 다른 실루엣으로 겹쳐진다/);
assert.match(orbit, /큰 별 그래프 · 약 1\.2초 간격 월별 변화/);
assert.match(orbit, /별 꼭짓점 · 각성→밝기→다양성→기록 밀도→전월 이동/);
assert.match(orbit, /옅은 별 · 이전 달의 모양 잔상/);

// 전환점은 작은 점의 링이 아니라 큰 별 전체의 주황 테두리다.
assert.match(orbit, /className="orbit-turning-shape"/);
assert.match(orbit, /주황 테두리 · 직전 연속 월 대비 좌표 1\.25 이상 이동/);

// 데스크톱 판은 넓고, 모바일 판도 축 이름과 별이 잘리지 않을 높이를 가진다.
const variants = orbit.match(/const VARIANTS = \{[\s\S]*?\n\};/);
assert.ok(variants, "VARIANTS를 찾지 못했다");
const heights = [...variants[0].matchAll(/[{,]\s*H: (\d+)/g)].map((m) => Number(m[1]));
for (const height of heights) assert.ok(height >= 420, `판 높이 ${height}는 큰 별을 담기에 부족하다`);
const desktopWidth = Number(variants[0].match(/desktop: \{ key: "d", W: (\d+)/)?.[1]);
assert.ok(desktopWidth >= 900, "데스크톱 큰 별 그래프는 충분히 넓어야 한다");

// 실제 절대 좌표는 별 그래프와 별개의 고정 척도 연도 비교에서 보존한다.
assert.match(orbit, /const DOMAIN = \[-3, 3\]/);
assert.match(orbit, /export function YearComparison\(/);

// 기록이 없는 달은 시간축에서도 값이 있는 것처럼 이어 그리지 않는다.
assert.match(orbit, /export function EmotionTrend\(/);
assert.match(page, /<EmotionTrend/);
assert.match(orbit, /기록이 없는 달은 선을 잇지 않는다/);

console.log("✓ 정서 지도 — 하나의 큰 다섯 축 별 · 월별 잔상 · 순차 변화");
