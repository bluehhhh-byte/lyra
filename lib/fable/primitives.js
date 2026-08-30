// drawing engine adapted from https://www.kengoworks.com/fable (Kevin Ngo / Fable 5)

import {
  PALETTE,
  TAU,
  bbox,
  chance,
  chaikin,
  clamp,
  fbm,
  h2,
  pick,
  rd,
  resample,
  rgba,
  ri,
  rotatePoints,
  shade,
  spiralPoints,
  stream,
} from "./core.js";

export function createHand(surface, initialColor = PALETTE.INK) {
  let currentColor = initialColor;
  const emit = surface.emit;

  function setColor(color) {
    currentColor = color;
  }

  function wob(random, points, amplitude) {
    const phaseA = rd(random, 0, 7);
    const phaseB = rd(random, 0, 7);
    const phaseC = rd(random, 0, 7);
    const frequencyA = rd(random, 1.6, 3.2);
    const frequencyB = rd(random, 5, 9);
    return points.map((point, index) => {
      const amount = points.length > 1 ? index / (points.length - 1) : 0;
      const before = points[Math.max(0, index - 1)];
      const after = points[Math.min(points.length - 1, index + 1)];
      let nx = -(after[1] - before[1]);
      let ny = after[0] - before[0];
      const length = Math.hypot(nx, ny) || 1;
      nx /= length;
      ny /= length;
      const offset = amplitude * (
        0.62 * Math.sin(amount * frequencyA * 2 + phaseA) +
        0.28 * Math.sin(amount * frequencyB + phaseB) +
        0.1 * Math.sin(amount * 17 + phaseC)
      );
      return [point[0] + nx * offset + rd(random, -0.3, 0.3), point[1] + ny * offset + rd(random, -0.3, 0.3)];
    });
  }

  function sk(random, points, options = {}) {
    const width = options.w ?? 1.3;
    const alpha = options.a ?? 0.7;
    const sampled = resample(points, Math.max(2.4, width * 1.5));
    if (sampled.length < 2) return;
    const color = [...(options.col || currentColor)];
    const passes = options.passes ?? 1;
    const [, y0, , y1] = bbox(sampled);

    for (let pass = 0; pass < passes; pass++) {
      const amplitude = (options.amp ?? (width * 0.38 + 0.55)) * (pass ? 1.5 : 1);
      const passAlpha = alpha * (pass ? 0.35 : 1);
      const path = wob(random, sampled, amplitude);
      if (options.taper) {
        const segments = [];
        for (let index = 1; index < path.length; index++) {
          const amount = index / (path.length - 1);
          const edge = options.taper === "out"
            ? 0.3 + 0.7 * (1 - amount)
            : options.taper === "in"
              ? 0.3 + 0.7 * amount
              : 0.35 + 0.65 * Math.min(1, Math.min(amount, 1 - amount) / 0.25);
          segments.push({
            a: path[index - 1],
            b: path[index],
            color: rgba(color, passAlpha * rd(random, 0.8, 1)),
            width: Math.max(0.5, width * edge * rd(random, 0.85, 1.15)),
          });
        }
        emit(y0, y1, (context) => {
          for (const segment of segments) {
            context.strokeStyle = segment.color;
            context.lineWidth = segment.width;
            context.beginPath();
            context.moveTo(...segment.a);
            context.lineTo(...segment.b);
            context.stroke();
          }
        });
      } else {
        const lifts = path.map(() => Boolean(options.gap && chance(random, options.gap)));
        const stroke = rgba(color, passAlpha);
        const lineWidth = width * rd(random, 0.85, 1.12);
        emit(y0, y1, (context) => {
          context.strokeStyle = stroke;
          context.lineWidth = lineWidth;
          context.beginPath();
          let lift = true;
          path.forEach((point, index) => {
            if (lift) context.moveTo(...point);
            else context.lineTo(...point);
            lift = lifts[index];
          });
          context.stroke();
        });
      }

      if (pass === 0 && width >= 1.9 && !options.noDust) {
        const dust = [];
        for (let index = 0; index < path.length; index += 3) {
          if (chance(random, 0.6)) continue;
          const size = rd(random, 0.6, 1.2);
          dust.push([
            path[index][0] + rd(random, -width, width) - size / 2,
            path[index][1] + rd(random, -width, width) - size / 2,
            size,
            rgba(color, alpha * rd(random, 0.14, 0.3)),
          ]);
        }
        if (dust.length) emit(y0, y1, (context) => {
          for (const mark of dust) {
            context.fillStyle = mark[3];
            context.fillRect(mark[0], mark[1], mark[2], mark[2]);
          }
        });
      }
    }
  }

  function dotF(random, x, y, radius, alpha, color = currentColor) {
    const phase = rd(random, 0, 7);
    const points = Array.from({ length: 9 }, (_, index) => {
      const angle = (index / 8) * TAU;
      const scale = 1 + 0.2 * Math.sin(angle * 2 + phase);
      return [x + Math.cos(angle) * radius * scale + rd(random, -0.2, 0.2), y + Math.sin(angle) * radius * scale + rd(random, -0.2, 0.2)];
    });
    emit(y - radius - 2, y + radius + 2, (context) => {
      context.fillStyle = rgba(color, alpha);
      context.beginPath();
      points.forEach((point, index) => index ? context.lineTo(...point) : context.moveTo(...point));
      context.closePath();
      context.fill();
    });
  }

  function fillPoly(points, color, alpha) {
    const [, y0, , y1] = bbox(points);
    const path = points.map((point) => [...point]);
    emit(y0, y1, (context) => {
      context.fillStyle = rgba(color, alpha);
      context.beginPath();
      path.forEach((point, index) => index ? context.lineTo(...point) : context.moveTo(...point));
      context.closePath();
      context.fill();
    });
  }

  function ellipse(random, cx, cy, rx, ry, options = {}) {
    const angle = rd(random, 0, TAU);
    const count = Math.max(12, Math.round((rx + ry) / 2));
    const points = Array.from({ length: count + 1 }, (_, index) => {
      const amount = (index / count) * TAU;
      const x = Math.cos(amount) * rx;
      const y = Math.sin(amount) * ry;
      return [cx + x * Math.cos(angle) - y * Math.sin(angle), cy + x * Math.sin(angle) + y * Math.cos(angle)];
    });
    sk(random, points, options);
  }

  function blob(random, cx, cy, rx, ry) {
    const rotation = rd(random, 0, TAU);
    const phase = rd(random, 0, 7);
    const points = Array.from({ length: 14 }, (_, index) => {
      const angle = (index / 14) * TAU;
      const scale = 1 + 0.16 * Math.sin(angle * 2 + phase) + 0.09 * Math.sin(angle * 5 + phase * 2.1);
      const x = Math.cos(angle) * rx * scale;
      const y = Math.sin(angle) * ry * scale;
      return [cx + x * Math.cos(rotation) - y * Math.sin(rotation), cy + x * Math.sin(rotation) + y * Math.cos(rotation)];
    });
    return chaikin(points, true, 1);
  }

  function scribFill(random, points, spacing, alpha, options = {}) {
    const [x0, y0, x1, y1] = bbox(points);
    const color = options.col || currentColor;
    const lines = [];
    const slope = rd(random, -0.2, 0.2);
    for (let y = y0 - spacing; y < y1 + spacing; y += spacing * rd(random, 0.8, 1.2)) {
      const phase = rd(random, 0, 7);
      const raw = [];
      for (let x = x0; x <= x1; x += 4) raw.push([x, y + (x - x0) * slope + Math.sin(x * 0.5 + phase) * spacing * 0.42 + rd(random, -0.8, 0.8)]);
      if (raw.length > 1) lines.push({ path: wob(random, resample(raw, 3.2), 0.55), color: rgba(color, alpha * rd(random, 0.6, 1.05)), width: (options.w ?? 1) * rd(random, 0.85, 1.12) });
    }
    const polygon = points.map((point) => [...point]);
    emit(y0, y1, (context) => {
      context.save();
      context.beginPath();
      polygon.forEach((point, index) => index ? context.lineTo(...point) : context.moveTo(...point));
      context.closePath();
      context.clip();
      for (const line of lines) {
        context.strokeStyle = line.color;
        context.lineWidth = line.width;
        context.beginPath();
        line.path.forEach((point, index) => index ? context.lineTo(...point) : context.moveTo(...point));
        context.stroke();
      }
      context.restore();
    });
  }

  function hatchFill(random, points, spacing, angle, alpha, options = {}) {
    const [x0, y0, x1, y1] = bbox(points);
    const diagonal = Math.hypot(x1 - x0, y1 - y0);
    const centerX = (x0 + x1) / 2;
    const centerY = (y0 + y1) / 2;
    const perpendicular = [Math.cos(angle + Math.PI / 2), Math.sin(angle + Math.PI / 2)];
    const direction = [Math.cos(angle), Math.sin(angle)];
    const count = Math.ceil(diagonal / spacing);
    const polygon = points.map((point) => [...point]);
    const lines = [];
    for (let index = -count; index <= count; index++) {
      const offset = index * spacing + (options.straight ? 0 : rd(random, -0.2, 0.2) * spacing);
      const raw = [
        [centerX + perpendicular[0] * offset - direction[0] * diagonal * 0.6, centerY + perpendicular[1] * offset - direction[1] * diagonal * 0.6],
        [centerX + perpendicular[0] * offset + direction[0] * diagonal * 0.6, centerY + perpendicular[1] * offset + direction[1] * diagonal * 0.6],
      ];
      lines.push(options.straight ? raw : wob(random, resample(raw, 4), 0.7));
    }
    emit(y0, y1, (context) => {
      context.save();
      context.beginPath();
      polygon.forEach((point, index) => index ? context.lineTo(...point) : context.moveTo(...point));
      context.closePath();
      context.clip();
      context.strokeStyle = rgba(options.col || currentColor, alpha);
      context.lineWidth = options.w ?? 1.1;
      for (const line of lines) {
        context.beginPath();
        context.moveTo(...line[0]);
        context.lineTo(...line[1]);
        context.stroke();
      }
      context.restore();
    });
  }

  function spatter(random, x, y, radius, count, color, alpha = 0.5) {
    const seed = ri(random, 0, 99999);
    emit(y - radius, y + radius, (context) => {
      const marks = stream(seed);
      for (let index = 0; index < count; index++) {
        const angle = marks() * TAU;
        const distance = Math.sqrt(marks()) * radius;
        const size = 0.8 + marks() * marks() * 2.2;
        context.fillStyle = rgba(color, alpha * (0.3 + marks() * 0.7));
        context.fillRect(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance * 0.7, size, size * (0.8 + marks() * 0.5));
      }
    });
  }

  function drip(random, x, y, length, color, alpha = 0.3, width = 2) {
    const points = [[x, y]];
    let px = x;
    for (let distance = 0; distance < length; distance += 9) {
      px += rd(random, -1.4, 1.4);
      points.push([px, y + distance]);
    }
    sk(random, points, { col: color, w: width, a: alpha, taper: "out", amp: 0.4 });
    dotF(random, px, y + length, width * 1.1, alpha * 1.2, color);
  }

  function arrowHead(random, x, y, angle, size, alpha, color, width = 1.6) {
    for (const direction of [-1, 1]) {
      sk(random, [[x, y], [x - Math.cos(angle + direction * 0.5) * size, y - Math.sin(angle + direction * 0.5) * size]], { col: color, w: width, a: alpha, taper: "out" });
    }
  }

  function spark(random, x, y, radius, options = {}) {
    const count = options.nR ?? ri(random, 5, 8);
    const rotation = rd(random, 0, TAU);
    const color = options.col || currentColor;
    for (let index = 0; index < count; index++) {
      const angle = rotation + (index / count) * TAU + (rd(random, -0.14, 0.14) / count) * TAU;
      const inner = radius * rd(random, 0.22, 0.34);
      const outer = radius * rd(random, 0.85, 1.1) * (index % 2 ? 0.78 : 1);
      sk(random, [[x + Math.cos(angle) * inner, y + Math.sin(angle) * inner], [x + Math.cos(angle) * outer, y + Math.sin(angle) * outer]], { col: color, w: options.w ?? 1.3, a: (options.a ?? 0.75) * rd(random, 0.8, 1), taper: "out", amp: 0.3 });
    }
    if (!options.noCenter && chance(random, 0.55)) dotF(random, x, y, Math.max(1, radius * 0.13), options.a ?? 0.75, color);
  }

  function aword(random, x, y, height, letterCount, options = {}) {
    const points = [[x, y + rd(random, -0.1, 0.1) * height]];
    let cursor = x;
    for (let index = 0; index < letterCount; index++) {
      const up = y - height * rd(random, 0.32, 0.62) - (chance(random, 0.13) ? height * rd(random, 0.4, 0.75) : 0);
      const down = y + (chance(random, 0.09) ? height * rd(random, 0.3, 0.55) : height * rd(random, -0.06, 0.12));
      cursor += height * rd(random, 0.18, 0.3);
      points.push([cursor, up]);
      cursor += height * rd(random, 0.18, 0.3);
      points.push([cursor, down]);
    }
    sk(random, chaikin(points, false, 1), { col: options.col, w: options.w ?? 0.9, a: options.a ?? 0.55, amp: 0.28 });
    return cursor - x;
  }

  function atext(random, left, right, y, height, options = {}) {
    let cursor = left;
    let guard = 0;
    while (cursor < right - height * 0.9 && guard++ < 70) {
      let letters = ri(random, 2, 5);
      if (cursor + letters * height * 0.5 > right) letters = Math.max(1, Math.floor((right - cursor) / (height * 0.5)));
      if (!letters) break;
      cursor += aword(random, cursor, y, height, letters, options) + height * rd(random, 0.45, 0.75);
    }
  }

  const arcs = (cx, cy, rx, ry, from, to, count = 9) => Array.from({ length: count + 1 }, (_, index) => {
    const angle = from + ((to - from) * index) / count;
    return [cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry];
  });
  const glyphs = {
    a: { w: 0.62, s: [arcs(0.27, 0.73, 0.23, 0.26, -0.5, 5.8), [[0.5, 0.48], [0.52, 0.96], [0.6, 1]]] },
    b: { w: 0.6, s: [[[0.1, 0.05], [0.1, 1]], [[0.1, 0.56], [0.34, 0.47], [0.54, 0.62], [0.53, 0.86], [0.3, 1], [0.1, 0.9]]] },
    c: { w: 0.58, s: [arcs(0.3, 0.74, 0.25, 0.26, 0.6, 5.68)] },
    d: { w: 0.62, s: [arcs(0.28, 0.74, 0.24, 0.26, -0.5, 5.8), [[0.52, 0.05], [0.53, 0.95], [0.6, 1]]] },
    e: { w: 0.56, s: [[[0.08, 0.73], [0.48, 0.7], [0.49, 0.54], [0.3, 0.45], [0.1, 0.56], [0.07, 0.8], [0.26, 1], [0.5, 0.93]]] },
    f: { w: 0.46, s: [[[0.44, 0.12], [0.32, 0.05], [0.22, 0.14], [0.2, 1]], [[0.05, 0.48], [0.42, 0.46]]] },
    g: { w: 0.6, s: [arcs(0.28, 0.72, 0.23, 0.25, -0.5, 5.8), [[0.5, 0.48], [0.53, 1.12], [0.42, 1.36], [0.16, 1.32]]] },
    h: { w: 0.58, s: [[[0.1, 0.05], [0.1, 1]], [[0.1, 0.62], [0.3, 0.47], [0.48, 0.56], [0.5, 1]]] },
    i: { w: 0.26, s: [[[0.13, 0.5], [0.13, 0.96], [0.18, 1]], [[0.11, 0.27], [0.15, 0.3]]] },
    j: { w: 0.34, s: [[[0.22, 0.5], [0.24, 1.15], [0.12, 1.36], [-0.02, 1.28]], [[0.2, 0.27], [0.24, 0.3]]] },
    k: { w: 0.52, s: [[[0.1, 0.05], [0.1, 1]], [[0.44, 0.48], [0.12, 0.76]], [[0.2, 0.68], [0.46, 1]]] },
    l: { w: 0.3, s: [[[0.14, 0.05], [0.14, 0.93], [0.22, 1]]] },
    m: { w: 0.68, s: [[[0.07, 1], [0.07, 0.5]], [[0.07, 0.62], [0.2, 0.46], [0.33, 0.56], [0.34, 1]], [[0.34, 0.62], [0.47, 0.46], [0.6, 0.56], [0.61, 1]]] },
    n: { w: 0.56, s: [[[0.09, 1], [0.09, 0.5]], [[0.09, 0.62], [0.28, 0.46], [0.46, 0.56], [0.48, 1]]] },
    o: { w: 0.6, s: [arcs(0.29, 0.73, 0.24, 0.26, -1.2, -1.2 + TAU * 0.97, 10)] },
    p: { w: 0.6, s: [[[0.1, 0.5], [0.1, 1.36]], [[0.1, 0.57], [0.34, 0.47], [0.53, 0.62], [0.52, 0.86], [0.3, 0.98], [0.1, 0.9]]] },
    q: { w: 0.62, s: [arcs(0.28, 0.72, 0.23, 0.25, -0.5, 5.8), [[0.5, 0.5], [0.52, 1.22], [0.62, 1.34]]] },
    r: { w: 0.44, s: [[[0.1, 1], [0.1, 0.5]], [[0.1, 0.68], [0.22, 0.5], [0.42, 0.46]]] },
    s: { w: 0.52, s: [[[0.46, 0.52], [0.24, 0.45], [0.09, 0.58], [0.22, 0.72], [0.42, 0.8], [0.46, 0.93], [0.24, 1], [0.06, 0.92]]] },
    t: { w: 0.48, s: [[[0.26, 0.12], [0.25, 0.9], [0.36, 1]], [[0.08, 0.44], [0.46, 0.43]]] },
    u: { w: 0.58, s: [[[0.08, 0.5], [0.08, 0.84], [0.22, 1], [0.42, 0.9], [0.45, 0.5]], [[0.45, 0.6], [0.47, 0.96], [0.54, 1]]] },
    v: { w: 0.5, s: [[[0.06, 0.5], [0.26, 1], [0.46, 0.5]]] },
    w: { w: 0.62, s: [[[0.04, 0.5], [0.17, 1], [0.3, 0.62], [0.43, 1], [0.57, 0.5]]] },
    x: { w: 0.52, s: [[[0.07, 0.5], [0.47, 1]], [[0.47, 0.5], [0.07, 1]]] },
    y: { w: 0.54, s: [[[0.07, 0.5], [0.28, 1]], [[0.5, 0.5], [0.24, 1.14], [0.06, 1.34]]] },
    z: { w: 0.52, s: [[[0.07, 0.5], [0.45, 0.5], [0.06, 1], [0.47, 1]]] },
    ".": { w: 0.24, s: [[[0.1, 0.93], [0.13, 0.97]]] },
    "-": { w: 0.44, s: [[[0.05, 0.7], [0.38, 0.68]]] },
    " ": { w: 0.42, s: [] },
  };

  function measure(text, size) {
    return [...text.toLowerCase()].reduce((width, character) => width + ((glyphs[character] || glyphs[" "]).w + 0.1) * size, -0.1 * size);
  }

  function write(random, text, x, y, size, options = {}) {
    const normalized = String(text).toLowerCase();
    let cursor = options.cen ? x - measure(normalized, size) / 2 : x;
    const phase = rd(random, 0, 7);
    [...normalized].forEach((character, index) => {
      const glyph = glyphs[character] || glyphs[" "];
      const baseline = y + Math.sin(index * 0.8 + phase) * size * 0.045;
      for (const stroke of glyph.s) {
        const points = stroke.map((point) => [cursor + point[0] * size + rd(random, -0.02, 0.02) * size, baseline + (point[1] - 1) * size + rd(random, -0.02, 0.02) * size]);
        sk(random, points, { col: options.col, w: options.w ?? Math.max(0.85, size * 0.075), a: options.a ?? 0.7, amp: Math.min(0.5, size * 0.028) });
      }
      cursor += (glyph.w + 0.1) * size;
    });
    return cursor;
  }

  function tornPath(random, x0, y0, x1, y1, roughness, seed) {
    const points = [];
    const side = (ax, ay, bx, by, nx, ny, id) => {
      const length = Math.hypot(bx - ax, by - ay);
      const steps = Math.max(3, Math.round(length / 26));
      for (let index = 0; index < steps; index++) {
        const amount = index / steps;
        let offset = (fbm(amount * 3.1 + id * 7, id * 3.3, seed, 3) - 0.5) * 2 * roughness;
        if (h2(index * 1.7, id * 9.1, seed) > 0.93) offset += rd(random, 8, 22) * (h2(index, id, seed + 3) > 0.5 ? 1 : -1);
        points.push([ax + (bx - ax) * amount + nx * offset, ay + (by - ay) * amount + ny * offset]);
      }
    };
    side(x0, y0, x1, y0, 0, 1, 0);
    side(x1, y0, x1, y1, -1, 0, 1);
    side(x1, y1, x0, y1, 0, -1, 2);
    side(x0, y1, x0, y0, 1, 0, 3);
    return points;
  }

  function sheet(random, x0, y0, x1, y1, color, options = {}) {
    const roughness = options.rough ?? 16;
    const seed = ri(random, 0, 9999);
    let polygon = tornPath(random, x0, y0, x1, y1, roughness, seed);
    if (options.rot) polygon = rotatePoints(polygon, (x0 + x1) / 2, (y0 + y1) / 2, options.rot);
    fillPoly(polygon.map(([x, y]) => [x + 6, y + 8]), [12, 9, 7], 0.28);
    fillPoly(polygon, color, 1);
    const [left, top, right, bottom] = bbox(polygon);
    const paper = polygon.map((point) => [...point]);
    const grainSeed = ri(random, 0, 99999);
    for (let y = top; y < bottom; y += 560) {
      const bandBottom = Math.min(bottom, y + 560);
      const bandSeed = (grainSeed + Math.round(y * 13)) >>> 0;
      const count = Math.min(900, Math.round(((right - left) * (bandBottom - y)) / 2400));
      emit(y, bandBottom, (context) => {
        const grain = stream(bandSeed);
        context.save();
        context.beginPath();
        paper.forEach((point, index) => index ? context.lineTo(...point) : context.moveTo(...point));
        context.closePath();
        context.clip();
        for (let index = 0; index < count; index++) {
          const size = 0.8 + grain() * 1.1;
          context.fillStyle = grain() < 0.62 ? "rgba(45,40,34,.05)" : "rgba(255,252,244,.07)";
          context.fillRect(left + grain() * (right - left), y + grain() * (bandBottom - y), size, size);
        }
        context.restore();
      });
    }
    if (!options.noCore) {
      const edge = [...polygon, polygon[0]];
      const edgeRandom = stream((grainSeed ^ 40503) >>> 0);
      for (let index = 0; index < edge.length - 1; index += 11) {
        const end = Math.min(edge.length, index + 12);
        sk(edgeRandom, edge.slice(index, end), { col: [251, 247, 237], w: 2, a: 0.42, amp: 0.4, gap: 0.24, noDust: true });
        sk(edgeRandom, edge.slice(index, end).map(([x, y]) => [x + 2, y + 2]), { col: shade(color, 0.22), w: 1, a: 0.2, amp: 0.5, gap: 0.4, noDust: true });
      }
    }
    return polygon;
  }

  function threadX(y, width = surface.widthUnits || 1600, phase = 0) {
    const center = width * 0.5;
    return center + Math.sin(y * 0.0061 + 1.7 + phase) * width * 0.014 + Math.sin(y * 0.0013 + 0.4 + phase) * width * 0.024;
  }

  function threadSeg(random, y0, y1, color = PALETTE.GOLD, alpha = 0.6, options = {}) {
    let y = y0;
    while (y < y1) {
      const end = Math.min(y1, y + rd(random, 260, 420));
      const points = [];
      for (let yy = y; yy <= end; yy += 13) points.push([options.x?.(yy) ?? threadX(yy, options.width, options.phase), yy]);
      if (points.length > 1) sk(random, points, { col: color, w: options.w ?? 1.7, a: alpha * rd(random, 0.9, 1.15), amp: 1.1 });
      if (chance(random, 0.3)) dotF(random, points.at(-1)[0], end, 2.2, alpha, color);
      if (end >= y1) break;
      y = end - 8;
    }
  }

  function enso(random, cx, cy, radius, fraction = 0.88, color = currentColor, options = {}) {
    const start = rd(random, 0, TAU);
    const count = Math.max(12, Math.round(40 * fraction));
    const points = Array.from({ length: count + 1 }, (_, index) => {
      const angle = start + (index / count) * TAU * fraction;
      const scale = radius * (1 + 0.03 * Math.sin(index * 0.7));
      return [cx + Math.cos(angle) * scale, cy + Math.sin(angle) * scale];
    });
    const width = options.w ?? 9;
    const alpha = options.a ?? 0.75;
    sk(random, points, { col: color, w: width, a: alpha, amp: 3, taper: "out", noDust: true });
    sk(random, points.map(([x, y]) => [x + rd(random, 2, 5), y + rd(random, 2, 4)]), { col: color, w: width * 0.4, a: alpha * 0.3, amp: 3.4, gap: 0.12, noDust: true });
    return start + TAU * fraction;
  }

  function fern(random, x, y, height, color = PALETTE.SAGE) {
    const spine = [];
    for (let amount = 0; amount <= 1; amount += 0.07) spine.push([x + Math.sin(amount * 2.6) * height * 0.14, y - amount * height]);
    sk(random, spine, { col: color, w: 1.5, a: 0.6, amp: 0.5, taper: "out" });
    for (let amount = 0.08; amount < 0.95; amount += 0.06) {
      const point = spine[Math.min(spine.length - 1, Math.round(amount * spine.length))];
      const length = height * 0.16 * (1 - amount * 0.8);
      for (const direction of [-1, 1]) sk(random, [point, [point[0] + direction * length, point[1] - length * 0.5]], { col: color, w: 1, a: 0.5, amp: 0.4, taper: "out" });
    }
  }

  function moth(random, x, y, size, color = currentColor, alpha = 0.6) {
    for (const direction of [-1, 1]) {
      const wing = blob(random, x + direction * size * 0.55, y - size * 0.1, size * 0.62, size * 0.45);
      sk(random, [...wing, wing[0]], { col: color, w: 1.1, a: alpha, amp: 0.5 });
      scribFill(random, wing, size * 0.3, alpha * 0.4, { col: color });
    }
    sk(random, [[x, y - size * 0.45], [x, y + size * 0.5]], { col: color, w: 1.6, a: alpha, amp: 0.3 });
  }

  function whispers(random, y0, y1, dark = false, count = 4) {
    const color = dark ? PALETTE.CINK : PALETTE.INK;
    const width = surface.widthUnits || 1600;
    for (let index = 0; index < count; index++) {
      const left = chance(random, 0.5);
      const x = left ? rd(random, 26, width * 0.1) : rd(random, width * 0.9, width - 26);
      const y = rd(random, y0 + 40, y1 - 40);
      const alpha = rd(random, 0.25, 0.45);
      const kind = ri(random, 0, 4);
      if (kind === 0) sk(random, spiralPoints(x, y, rd(random, 8, 16), 2, rd(random, 1.5, 2.5), rd(random, 0, 7)), { col: color, w: 1, a: alpha, amp: 0.4 });
      else if (kind === 1) for (let dot = 0; dot < ri(random, 3, 6); dot++) dotF(random, x + dot * 7, y + rd(random, -2, 2), 1.2, alpha, color);
      else if (kind === 2) spark(random, x, y, rd(random, 6, 11), { col: color, a: alpha, w: 1, nR: 4, noCenter: true });
      else if (kind === 3) aword(random, x - 15, y, rd(random, 8, 12), ri(random, 2, 4), { col: color, a: alpha });
      else ellipse(random, x, y, rd(random, 5, 9), rd(random, 5, 9), { col: color, w: 1, a: alpha, amp: 0.4 });
    }
  }

  return {
    setColor,
    wob,
    sk,
    dotF,
    fillPoly,
    ellipse,
    blob,
    scribFill,
    hatchFill,
    spatter,
    drip,
    arrowHead,
    spark,
    aword,
    atext,
    measure,
    write,
    tornPath,
    sheet,
    threadX,
    threadSeg,
    enso,
    fern,
    moth,
    whispers,
  };
}
