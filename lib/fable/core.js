// drawing engine adapted from https://www.kengoworks.com/fable (Kevin Ngo / Fable 5)

export const TAU = Math.PI * 2;

export const PALETTE = Object.freeze({
  CREAM: [246, 241, 228],
  BLUSH: [237, 220, 208],
  SAGEP: [223, 226, 206],
  PLUMD: [47, 42, 36],
  INDIGO: [34, 32, 29],
  VOID: [24, 20, 17],
  INK: [42, 37, 31],
  CINK: [238, 231, 210],
  CLAY: [172, 80, 54],
  OCHRE: [176, 132, 50],
  GOLD: [214, 178, 108],
  SAGE: [104, 126, 86],
  SLATE: [88, 112, 148],
  ROSE: [196, 130, 122],
  PLUM: [152, 126, 98],
  TEAL: [92, 134, 130],
  STEEL: [136, 144, 156],
});

export function hashSeed(value) {
  let hash = 2166136261;
  for (const char of String(value || "lyra")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mul32(seed) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function stream(seed) {
  const random = mul32(Math.imul(seed, 2654435761) >>> 0);
  for (let i = 0; i < 9; i++) random();
  return random;
}

export const rd = (random, min, max) => min + random() * (max - min);
export const ri = (random, min, max) => Math.floor(rd(random, min, max + 1));
export const chance = (random, probability) => random() < probability;
export const pick = (random, values) => values[Math.floor(random() * values.length)];
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function h2(x, y, seed) {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

export function valueNoise(x, y, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  return (
    h2(ix, iy, seed) * (1 - sx) * (1 - sy) +
    h2(ix + 1, iy, seed) * sx * (1 - sy) +
    h2(ix, iy + 1, seed) * (1 - sx) * sy +
    h2(ix + 1, iy + 1, seed) * sx * sy
  );
}

export function fbm(x, y, seed, octaves = 4) {
  let amplitude = 0.5;
  let frequency = 1;
  let value = 0;
  let weight = 0;
  for (let i = 0; i < octaves; i++) {
    value += valueNoise(x * frequency, y * frequency, seed + i * 17) * amplitude;
    weight += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return weight ? value / weight : 0;
}

export const rgba = (color, alpha) => `rgba(${color[0] | 0},${color[1] | 0},${color[2] | 0},${alpha})`;
export const shade = (color, amount) => color.map((channel) => channel * (1 - amount));
export const tint = (color, amount) => color.map((channel) => channel + (255 - channel) * amount);
export const mix = (a, b, amount) => a.map((channel, index) => channel + (b[index] - channel) * amount);

export function resample(points, step) {
  if (points.length < 2) return points.map((point) => [...point]);
  const output = [[...points[0]]];
  let needed = step;
  for (let index = 1; index < points.length; index++) {
    let [x0, y0] = points[index - 1];
    const [x1, y1] = points[index];
    let distance = Math.hypot(x1 - x0, y1 - y0);
    while (distance >= needed && distance > 0) {
      const ratio = needed / distance;
      x0 += (x1 - x0) * ratio;
      y0 += (y1 - y0) * ratio;
      output.push([x0, y0]);
      distance = Math.hypot(x1 - x0, y1 - y0);
      needed = step;
    }
    needed -= distance;
  }
  const last = points.at(-1);
  const end = output.at(-1);
  if (output.length < 2 || Math.hypot(last[0] - end[0], last[1] - end[1]) > step * 0.2) output.push([...last]);
  return output;
}

export function chaikin(points, closed = false, iterations = 1) {
  let current = points.map((point) => [...point]);
  while (iterations-- > 0) {
    if (current.length < 3) return current;
    const output = closed ? [] : [[...current[0]]];
    const end = closed ? current.length : current.length - 1;
    for (let index = 0; index < end; index++) {
      const a = current[index];
      const b = current[(index + 1) % current.length];
      output.push(
        [a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25],
        [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75],
      );
    }
    if (!closed) output.push([...current.at(-1)]);
    current = output;
  }
  return current;
}

export function bbox(points) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

export function rotatePoints(points, cx, cy, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return points.map(([x, y]) => [
    cx + (x - cx) * cosine - (y - cy) * sine,
    cy + (x - cx) * sine + (y - cy) * cosine,
  ]);
}

export function spiralPoints(cx, cy, outerRadius, innerRadius, turns, phase = 0, direction = 1) {
  const count = Math.max(24, Math.round(turns * 30));
  return Array.from({ length: count + 1 }, (_, index) => {
    const amount = index / count;
    const angle = phase + direction * amount * turns * TAU;
    const radius = outerRadius + (innerRadius - outerRadius) * amount;
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
  });
}
