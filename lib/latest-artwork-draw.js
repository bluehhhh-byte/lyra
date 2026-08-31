import { PALETTE, rd } from "./fable/core.js";

// 이날의 그림을 실제로 긋는 붓질 목록. 화면(app/fable-scenes.js)과 테스트가 같은 함수를
// 부른다 — 그래야 열한 가지 지시문이 전부 오류 없이 그려지는지 캔버스 없이도 확인할 수 있다.
//
// 테마와 무관하게 언제나 크림색 종이 위의 검은 잉크다. 판화처럼 읽히게 한다.
export function latestArtworkTasks({ hand, plan, W, H, random }) {
  const ink = PALETTE.INK;
  const paint = (name) => PALETTE[name] || PALETTE.SLATE;
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const M = 14;
  const X0 = M + 18, X1 = W - M - 18, Y0 = M + 18, Y1 = H - M - 18;
  const IW = X1 - X0, IH = Y1 - Y0;
  const inner = [[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]];
  const at = (node) => ({ x: X0 + (node.x / 100) * IW, y: Y0 + (node.y / 100) * IH });
  const lead = plan.nodes[0];
  const leadColor = lead?.emotion ? paint(lead.color) : PALETTE.SLATE;
  const tasks = [];

  // 1) 바탕 — 찢긴 종이 한 장과 옅은 물감 자국
  tasks.push(() => hand.sheet(random, M, M, W - M, H - M, PALETTE.CREAM, { rough: 9, rot: rd(random, -0.018, 0.018) }));
  tasks.push(() => hand.scribFill(random, hand.blob(random, X0 + IW * rd(random, 0.3, 0.7), Y0 + IH * rd(random, 0.3, 0.7), IW * 0.42, IH * 0.36), 9, 0.07, { col: leadColor, w: 3 }));

  // 2) 형상 — 지시문마다 다르다. 어느 지시문인지는 lib/latest-artwork.js가 정한다.
  const score = plan.score;
  if (score === "constellation") {
    const nodes = plan.nodes.map((node) => ({ ...node, ...at(node) }));
    const middle = at(plan.center);
    tasks.push(() => hand.hatchFill(random, inner, 16, plan.angle, 0.05, { col: ink }));
    const path = nodes.map((node) => [node.x, node.y]);
    tasks.push(() => hand.sk(random, path, { col: ink, w: 2, a: 0.55, amp: 1.2 }));
    tasks.push(() => hand.sk(random, [...path].reverse(), { col: PALETTE.PLUM, w: 1, a: 0.3, amp: 2, gap: 0.2 }));
    nodes.forEach((node) => {
      const color = paint(node.color);
      const radius = node.radius * 1.5;
      tasks.push(() => hand.ellipse(random, node.x, node.y, radius * 2.3, radius * 1.6, { col: color, w: 0.8, a: 0.22, amp: 1.2, gap: 0.3 }));
      tasks.push(() => hand.ellipse(random, node.x, node.y, radius * 1.5, radius, { col: color, w: 1.8 + node.count * 0.2, a: 0.85, amp: 0.8 }));
      if (node.energy >= 0.55) tasks.push(() => hand.spark(random, node.x, node.y, radius * 2.4, { col: color, a: 0.85, w: 1.4, nR: 5 + Math.min(5, node.count), noCenter: true }));
      else tasks.push(() => hand.dotF(random, node.x, node.y, Math.max(2.6, radius * 0.36), 0.9, color));
    });
    tasks.push(() => hand.enso(random, middle.x, middle.y, 12 + plan.entropy * 10, 0.72, ink, { w: 2.2, a: 0.45 }));
  } else if (score === "repeat") {
    const color = leadColor;
    const rows = plan.params.rows;
    const gapY = Math.min(58, IH / Math.max(1, rows - 1));
    const top = Y0 + IH / 2 - ((rows - 1) * gapY) / 2;
    const step = 22 + plan.variant * 4;
    for (let row = 0; row < rows; row++) {
      const y = top + row * gapY;
      tasks.push(() => hand.scribFill(random, [[X0, y - 12], [X1, y - 12], [X1, y + 12], [X0, y + 12]], 6, 0.05, { col: color, w: 2 }));
      tasks.push(() => hand.sk(random, [[X0, y + 12], [X1 - 14, y + 12]], { col: ink, w: 0.9, a: 0.28, amp: 0.8, gap: 0.08 }));
      for (let x = X0 + 10; x < X1 - 16; x += step) {
        const px = x;
        if (plan.params.markKind === "spark") tasks.push(() => hand.spark(random, px + rd(random, -2, 2), y + rd(random, -2, 2), 10, { col: color, a: 0.88, w: 1.5, nR: 5, noCenter: true }));
        else if (plan.params.markKind === "ring") tasks.push(() => hand.ellipse(random, px, y, 9, 6, { col: color, w: 1.7, a: 0.85, amp: 0.7 }));
        else tasks.push(() => hand.sk(random, [[px, y - 9], [px + rd(random, -2, 2), y + 9]], { col: color, w: 2.6, a: 0.8, taper: "out", amp: 0.5 }));
      }
      tasks.push(() => hand.sk(random, [[X1 - 6, y - 8], [X1 - 4, y + 10]], { col: ink, w: 2.2, a: 0.7, taper: "out", amp: 0.3 }));
    }
  } else if (score === "solo") {
    const radius = Math.min(IW, IH) * 0.36;
    const cx = X0 + IW / 2, cy = Y0 + IH / 2;
    tasks.push(() => hand.hatchFill(random, inner, 15, plan.angle, 0.045, { col: ink }));
    tasks.push(() => hand.enso(random, cx, cy, radius, plan.params.fraction, leadColor, { w: 9 + Math.min(3, plan.keywordCount), a: 0.86 }));
    if ((lead?.energy ?? 0.5) >= 0.55) tasks.push(() => hand.spark(random, cx, cy, radius * 0.34, { col: ink, a: 0.7, w: 1.4, nR: 6, noCenter: true }));
    else tasks.push(() => hand.dotF(random, cx, cy, 4.5, 0.85, ink));
    for (let index = 0; index < plan.keywordCount; index++) tasks.push(() => hand.dotF(random, cx + rd(random, -radius * 0.55, radius * 0.55), cy + rd(random, -radius * 0.45, radius * 0.45), 2, 0.7, PALETTE.VIOLET));
    if ((lead?.energy ?? 0.5) < 0.4) tasks.push(() => hand.drip(random, cx + radius * 0.6, cy + radius * 0.5, IH * 0.28, leadColor, 0.5, 2.4));
  } else if (score === "pair") {
    const { left, right, seam } = plan.params;
    const seamX = X0 + seam * IW;
    const seamPoints = [];
    for (let y = Y0; y <= Y1; y += 12) seamPoints.push([seamX + Math.sin(y * 0.05 + plan.variant) * 6 + rd(random, -3, 3), y]);
    const leftPolygon = [[X0, Y0], ...seamPoints, [X0, Y1]];
    const rightPolygon = [[X1, Y0], ...seamPoints, [X1, Y1]];
    tasks.push(() => hand.hatchFill(random, leftPolygon, left.spacing, left.angle, 0.5, { col: paint(left.color) }));
    tasks.push(() => hand.hatchFill(random, rightPolygon, right.spacing, right.angle, 0.5, { col: paint(right.color) }));
    tasks.push(() => hand.sk(random, seamPoints, { col: ink, w: 2, a: 0.75, amp: 1.5 }));
    tasks.push(() => hand.spatter(random, seamX, Y0 + IH / 2, 28, 46, ink, 0.4));
    tasks.push(() => hand.moth(random, X0 + IW * 0.25, Y0 + IH * 0.3, 16, paint(left.color), 0.55));
    tasks.push(() => hand.moth(random, X0 + IW * 0.75, Y0 + IH * 0.7, 16, paint(right.color), 0.55));
  } else if (score === "strata") {
    const bands = plan.params.bands;
    const bandH = IH / bands;
    for (let index = 0; index < bands; index++) {
      const node = plan.perRecord[index] || lead;
      const yTop = Y1 - (index + 1) * bandH, yBottom = Y1 - index * bandH;
      const wob = (x) => Math.sin(x * 0.04 + index) * 3;
      const polygon = [[X0, yTop + wob(X0)], [X0 + IW * 0.5, yTop + wob(X0 + IW * 0.5)], [X1, yTop + wob(X1)], [X1, yBottom + wob(X1)], [X0 + IW * 0.5, yBottom + wob(X0 + IW * 0.5)], [X0, yBottom + wob(X0)]];
      tasks.push(() => hand.hatchFill(random, polygon, 6.5, node.angle, 0.5, { col: paint(node.color) }));
      tasks.push(() => hand.sk(random, polygon.slice(0, 3), { col: ink, w: 1.4, a: 0.4, amp: 1.2 }));
    }
    tasks.push(() => hand.sk(random, [[X0, Y1], [X1, Y1]], { col: ink, w: 2.2, a: 0.7, amp: 0.6 }));
  } else if (score === "grid") {
    const { cells, rows, cols } = plan.params;
    const cw = IW / cols, ch = IH / rows;
    const directions = [Math.PI / 2, 0, Math.PI / 4, -Math.PI / 4];
    for (let index = 0; index < cells; index++) {
      const col = index % cols, row = Math.floor(index / cols);
      const node = plan.perRecord[index] || lead;
      const x = X0 + col * cw, y = Y0 + row * ch;
      const cell = [[x + 3, y + 3], [x + cw - 3, y + 3], [x + cw - 3, y + ch - 3], [x + 3, y + ch - 3]];
      tasks.push(() => hand.hatchFill(random, cell, 6, directions[(col + row) % 4], 0.55, { col: paint(node.color) }));
      tasks.push(() => hand.sk(random, [...cell, cell[0]], { col: ink, w: 1.1, a: 0.5, amp: 0.6 }));
    }
  } else if (score === "rain") {
    tasks.push(() => hand.hatchFill(random, inner, 14, Math.PI / 2, 0.04, { col: ink }));
    for (let index = 0; index < plan.params.drops; index++) {
      const node = plan.perRecord[index % plan.perRecord.length] || lead;
      const color = index % 3 === 0 ? ink : paint(node.color);
      tasks.push(() => hand.drip(random, rd(random, X0 + 4, X1 - 4), Y0 + rd(random, 0, 14), IH * rd(random, 0.28, 0.86), color, rd(random, 0.4, 0.62), rd(random, 1.6, 2.6)));
    }
  } else if (score === "burst") {
    const cx = X0 + IW * clamp(plan.center.x / 100, 0.3, 0.7), cy = Y0 + IH * clamp(plan.center.y / 100, 0.3, 0.7);
    const outer = Math.min(IW, IH) * 0.46;
    const spokes = plan.params.spokes;
    for (let index = 0; index < spokes; index++) {
      const angle = (index / spokes) * Math.PI * 2 + rd(random, -0.05, 0.05);
      const node = plan.perRecord[index % plan.perRecord.length] || lead;
      const color = index % 2 ? ink : paint(node.color);
      const r0 = outer * rd(random, 0.14, 0.22), r1 = outer * rd(random, 0.55, 1) * (0.6 + 0.4 * (lead?.energy ?? 0.5));
      tasks.push(() => hand.sk(random, [[cx + Math.cos(angle) * r0, cy + Math.sin(angle) * r0], [cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1]], { col: color, w: rd(random, 1.4, 2.6), a: rd(random, 0.6, 0.9), taper: "out", amp: 0.6 }));
    }
    tasks.push(() => hand.spatter(random, cx, cy, outer * 0.9, 90, leadColor, 0.45));
    tasks.push(() => hand.spatter(random, cx, cy, outer * 0.5, 40, ink, 0.35));
  } else if (score === "growth") {
    const stalks = plan.params.stalks;
    for (let index = 0; index < stalks; index++) {
      const node = plan.perRecord[index] || lead;
      const x = X0 + IW * ((index + 0.5) / stalks) + rd(random, -8, 8);
      const height = IH * (0.35 + 0.45 * clamp(((node.v ?? 0) + 3) / 6, 0, 1));
      tasks.push(() => hand.fern(random, x, Y1 - 2, height, paint(node.color)));
    }
    tasks.push(() => hand.sk(random, [[X0, Y1], [X1, Y1]], { col: ink, w: 1.6, a: 0.6, amp: 0.5 }));
    for (let index = 0; index < plan.keywordCount; index++) tasks.push(() => hand.moth(random, X0 + IW * rd(random, 0.15, 0.85), Y0 + IH * rd(random, 0.1, 0.45), 11, ink, 0.5));
  } else if (score === "letters") {
    const lines = [];
    for (let y = Y0 + 12; y < Y1 - 4; y += 17) lines.push(y);
    lines.forEach((y, index) => tasks.push(() => hand.atext(random, X0 + (index % 5 === 0 ? 24 : 0), X1 - rd(random, 0, 40), y, 11, { col: ink, a: rd(random, 0.3, 0.5), w: 1.1 })));
    for (let index = 0; index < plan.params.marks; index++) {
      const y = lines[Math.floor(rd(random, 0, lines.length))] + 6;
      const x = X0 + rd(random, 0, IW * 0.6);
      tasks.push(() => hand.sk(random, [[x, y], [x + rd(random, 26, 60), y + rd(random, -1, 1)]], { col: leadColor, w: 2.6, a: 0.85, amp: 0.5 }));
    }
  } else {
    // thread
    const knots = plan.params.knots;
    const points = Array.from({ length: knots }, (_, index) => ({ x: X0 + IW * ((index + 0.5) / knots) + rd(random, -IW * 0.06, IW * 0.06), y: Y0 + IH * rd(random, 0.2, 0.8), node: plan.perRecord[index] || lead }));
    const path = [[X0 - 6, points[0].y + rd(random, -20, 20)]];
    points.forEach((point, index) => {
      const previous = path.at(-1);
      for (let step = 1; step <= 6; step++) {
        const amount = step / 6;
        path.push([previous[0] + (point.x - previous[0]) * amount, previous[1] + (point.y - previous[1]) * amount + Math.sin(amount * Math.PI) * (index % 2 ? 18 : -18)]);
      }
    });
    path.push([X1 + 6, points.at(-1).y + rd(random, -20, 20)]);
    tasks.push(() => hand.sk(random, path, { col: PALETTE.GOLD, w: 2.1, a: 0.85, amp: 1.3 }));
    tasks.push(() => hand.sk(random, path.map(([x, y]) => [x + 1.5, y + 2]), { col: PALETTE.GOLD, w: 0.8, a: 0.3, amp: 1.8, gap: 0.15 }));
    points.forEach((point) => tasks.push(() => hand.enso(random, point.x, point.y, 7, 0.92, paint(point.node.color), { w: 3, a: 0.9 })));
  }

  // 3) 마감 — 날씨와 여백의 메모
  if (plan.weather === "rain") {
    for (let index = 0; index < plan.weatherCount; index++) tasks.push(() => hand.drip(random, rd(random, X0, X1), Y0 + rd(random, 0, 16), IH * rd(random, 0.3, 0.7), ink, 0.42, 2));
  } else if (plan.weather === "spatter") {
    for (let index = 0; index < 2; index++) tasks.push(() => hand.spatter(random, X0 + IW * rd(random, 0.25, 0.75), Y0 + IH * rd(random, 0.25, 0.75), 36, 60, leadColor, 0.45));
  } else if (plan.weather === "growth") {
    for (let index = 0; index < plan.weatherCount; index++) tasks.push(() => hand.fern(random, rd(random, X0 + 8, X1 - 8), Y1 - 2, IH * rd(random, 0.18, 0.34), PALETTE.SAGE));
  }
  tasks.push(() => hand.whispers(random, Y0, Y1, false, 2));

  return tasks;
}
