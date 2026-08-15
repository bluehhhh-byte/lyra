// 감정 궤도의 축 범위·라벨 배치 — 점과 라벨이 겹쳐 월을 못 읽는 일이 없어야 한다.
//   node lib/orbit-layout.test.mjs
import assert from "node:assert/strict";
import { axisRange, placeLabels, clampLabel, textBounds, AXIS_MIN_SPAN } from "./orbit-layout.js";

// 축 범위 — 0은 언제나 안에 남고, 좁게 뭉친 데이터도 최소 폭을 지킨다
{
  const [lo, hi] = axisRange([-2, -1.8, -1.5]);
  assert.ok(lo < -2 && hi >= 0, "데이터가 한쪽에 몰려도 중립선(0)은 화면 안에 있다");
  assert.ok(hi - lo >= AXIS_MIN_SPAN - 1e-9, "최소 폭 보장");

  const [lo2, hi2] = axisRange([0.2, 0.25]);
  assert.ok(hi2 - lo2 >= AXIS_MIN_SPAN - 1e-9, "한두 달짜리 해가 과장돼 보이지 않는다");

  const [lo3, hi3] = axisRange([-3, 3]);
  assert.equal(lo3, -3, "좌표계 한계를 넘지 않는다");
  assert.equal(hi3, 3);

  assert.deepEqual(axisRange([]), [-3, 3], "데이터가 없으면 전체 범위");
}
console.log("✓ 축 범위");

// 라벨 배치 — 같은 자리에 겹쳐 놓지 않는다
{
  const pts = [
    { x: 100, y: 100, r: 10, w: 30, h: 14 },
    { x: 104, y: 104, r: 10, w: 30, h: 14 },
    { x: 108, y: 96, r: 10, w: 30, h: 14 },
    { x: 100, y: 108, r: 10, w: 30, h: 14 },
  ];
  const labels = placeLabels(pts);
  assert.equal(labels.length, pts.length);
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i], b = labels[j];
      const apart = Math.abs(a.x - b.x) >= 30 || Math.abs(a.y - b.y) >= 14;
      assert.ok(apart, `라벨 ${i}와 ${j}가 겹친다`);
    }
  }
  // 멀리 떨어진 점은 기본 자리(아래)를 그대로 쓴다
  const far = placeLabels([{ x: 50, y: 50, r: 8, w: 30, h: 14 }]);
  assert.equal(far[0].x, 50);
  assert.equal(far[0].y, 50 + 8 + 12);

  // away 힌트를 주면 그 쪽으로 간다 — 라벨이 이동 화살표를 덮지 않게
  const up = placeLabels([{ x: 50, y: 50, r: 8, w: 30, h: 14, away: { x: 0, y: -1 } }]);
  assert.ok(up[0].y < 50, "away가 위쪽이면 라벨도 위쪽");
}
console.log("✓ 라벨 겹침 회피");

// anchor별 텍스트 경계
{
  assert.deepEqual(textBounds(100, "middle", 40), [80, 120]);
  assert.deepEqual(textBounds(100, "start", 40), [100, 140]);
  assert.deepEqual(textBounds(100, "end", 40), [60, 100]);
}

// viewBox 밖으로 나가는 라벨은 안으로 민다 — 글자를 줄이지 않는다
{
  const box = { width: 360, height: 400, pad: 5 };
  const left = clampLabel({ x: 2, y: 200, anchor: "middle", w: 40, h: 14 }, box);
  const [l] = textBounds(left.x, "middle", 40);
  assert.ok(l >= box.pad - 1e-9, `왼쪽으로 삐져나감: ${l}`);

  const right = clampLabel({ x: 358, y: 200, anchor: "middle", w: 40, h: 14 }, box);
  const [, r] = textBounds(right.x, "middle", 40);
  assert.ok(r <= box.width - box.pad + 1e-9, `오른쪽으로 삐져나감: ${r}`);

  const top = clampLabel({ x: 180, y: 3, anchor: "middle", w: 40, h: 14 }, box);
  assert.ok(top.y - 14 * 0.8 >= box.pad - 1e-9, "글자 윗부분이 잘린다");

  const bottom = clampLabel({ x: 180, y: 399, anchor: "middle", w: 40, h: 14 }, box);
  assert.ok(bottom.y + 14 * 0.25 <= box.height - box.pad + 1e-9, "글자 아랫부분이 잘린다");

  // 이미 안에 있으면 건드리지 않는다
  const inside = clampLabel({ x: 180, y: 200, anchor: "middle", w: 40, h: 14 }, box);
  assert.equal(inside.x, 180);
  assert.equal(inside.y, 200);
}
console.log("✓ viewBox 안으로 clamp");
console.log("all passed");
