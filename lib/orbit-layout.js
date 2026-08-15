// 감정 궤도의 좌표 배치 — 순수 계산이라 테스트가 붙는다.
//
// 두 가지를 푼다.
//  1) 축 범위: 전체 -3..3을 늘 쓰면 실제 기록이 한 귀퉁이에 뭉쳐 점이 서로 겹친다.
//     데이터가 차지하는 범위에 맞춰 잡되, 0(중립선)은 언제나 화면 안에 두고
//     최소 폭을 보장해 한두 달짜리 해가 과장돼 보이지 않게 한다.
//  2) 라벨 위치: 점 아래가 기본이지만 이미 놓인 라벨·점과 겹치면 다른 자리로 민다.
//     색만으로 구분하지 않는다는 원칙상 월 라벨은 반드시 읽혀야 한다.

export const AXIS_MIN_SPAN = 2.4; // 좌표 단위. 이보다 좁으면 확대를 멈춘다
export const AXIS_PAD = 0.18; // 데이터 폭의 18%를 여백으로

// 한 축의 표시 범위 — values는 좌표값 배열
export function axisRange(values, { minSpan = AXIS_MIN_SPAN, pad = AXIS_PAD, limit = 3 } = {}) {
  if (!values.length) return [-limit, limit];
  let lo = Math.min(...values, 0);
  let hi = Math.max(...values, 0);
  const margin = Math.max((hi - lo) * pad, 0.25);
  lo -= margin;
  hi += margin;
  const grow = minSpan - (hi - lo);
  if (grow > 0) {
    lo -= grow / 2;
    hi += grow / 2;
  }
  return [Math.max(-limit, lo), Math.min(limit, hi)];
}

// 후보 방향이 away와 얼마나 같은 쪽인지 — 정렬 기준일 뿐이라 정규화까지는 안 한다
const score = (c, away) => {
  const len = Math.hypot(c.dx, c.dy) || 1;
  return (c.dx / len) * away.x + (c.dy / len) * away.y;
};

const overlaps = (a, b, gap = 2) =>
  a.x - a.w / 2 < b.x + b.w / 2 + gap &&
  a.x + a.w / 2 + gap > b.x - b.w / 2 &&
  a.y - a.h / 2 < b.y + b.h / 2 + gap &&
  a.y + a.h / 2 + gap > b.y - b.h / 2;

// 점마다 라벨 자리를 정한다. points: [{x, y, r, w, h, away?}] (픽셀 좌표)
// away는 "이 방향으로 놓으면 좋다"는 힌트다 — 궤도에서는 이웃 점과 잇는 선의
// 반대쪽을 넘긴다. 라벨 배경이 화살표를 덮어 이동 순서가 끊겨 보이던 문제를 막는다.
// 반환: [{x, y, anchor}] — 겹치지 않는 자리를 못 찾으면 아래쪽을 쓴다.
export function placeLabels(points) {
  const placed = [];
  const blockers = points.map((p) => ({ x: p.x, y: p.y, w: p.r * 2, h: p.r * 2 }));
  return points.map((p) => {
    const base = [
      { dx: 0, dy: p.r + 12 },
      { dx: 0, dy: -p.r - 6 },
      { dx: p.r + 6 + p.w / 2, dy: 4 },
      { dx: -p.r - 6 - p.w / 2, dy: 4 },
      { dx: p.r + 4 + p.w / 2, dy: p.r + 12 },
      { dx: -p.r - 4 - p.w / 2, dy: p.r + 12 },
      { dx: p.r + 4 + p.w / 2, dy: -p.r - 6 },
      { dx: -p.r - 4 - p.w / 2, dy: -p.r - 6 },
      { dx: 0, dy: p.r + 26 },
    ].map((c) => ({ ...c, anchor: "middle" }));
    const candidates = p.away
      ? [...base].sort((a, b) => score(b, p.away) - score(a, p.away))
      : base;
    for (const c of candidates) {
      const box = { x: p.x + c.dx, y: p.y + c.dy, w: p.w, h: p.h };
      const hit = placed.some((q) => overlaps(box, q)) || blockers.some((b) => overlaps(box, b));
      if (!hit) {
        placed.push(box);
        return { x: box.x, y: box.y, anchor: c.anchor };
      }
    }
    const fallback = { x: p.x, y: p.y + p.r + 12, w: p.w, h: p.h };
    placed.push(fallback);
    return { x: fallback.x, y: fallback.y, anchor: "middle" };
  });
}
