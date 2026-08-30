const TAU = Math.PI * 2;
const OPEN_CIRCLE_ARC = TAU * (340 / 360);
const clamp01 = (value) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

export function hashSlug(slug) {
  let hash = 2166136261;
  const value = String(slug || "lyra");
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
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

function h2(x, y, seed) {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function vn(x, y, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = h2(ix, iy, seed) * (1 - sx) + h2(ix + 1, iy, seed) * sx;
  const bottom = h2(ix, iy + 1, seed) * (1 - sx) + h2(ix + 1, iy + 1, seed) * sx;
  return top * (1 - sy) + bottom * sy;
}

function fbm(x, y, seed, octaves = 4) {
  let value = 0;
  let amplitude = 0.5;
  let scale = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    value += vn(x * scale, y * scale, seed + i * 13) * amplitude;
    total += amplitude;
    scale *= 2.03;
    amplitude *= 0.5;
  }
  return total ? value / total : 0;
}

const INTENSE = [
  "metal", "hard rock", "punk", "grunge", "hip-hop", "dance", "house", "electronic",
  "격정", "분노", "폭발", "저항", "불안",
];
const CALM = [
  "ballad", "folk", "jazz", "classical", "dream pop", "ambient", "고요", "평온", "위로", "그리움",
];

function energyBias(meta = {}) {
  const text = [meta.genre, meta.emotion, ...(meta.tags || [])].filter(Boolean).join(" ").toLowerCase();
  const intense = INTENSE.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0);
  const calm = CALM.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0);
  return clamp01(0.48 + intense * 0.16 - calm * 0.15);
}

export function composition(seed, meta = {}) {
  const rng = mul32(seed >>> 0);
  const energy = energyBias(meta);
  const lineCount = Math.round(3 + energy * 6 + rng() * 2);
  const palette = energy >= 0.58 ? ["accent", "ink", "muted"] : ["muted", "ink"];
  const strokes = [];

  // fable의 열린 원 — 끝을 20도 남겨 두고, 중심과 반지름만 곡마다 바뀐다.
  strokes.push({
    kind: "circle",
    cx: 0.18 + rng() * 0.64,
    cy: 0.18 + rng() * 0.64,
    radius: 0.09 + rng() * 0.17,
    startAngle: rng() * TAU,
    arc: OPEN_CIRCLE_ARC,
    width: 0.7 + energy * 1.4 + rng(),
    speed: 0.55 + rng() * 0.55,
    palette: palette[Math.floor(rng() * palette.length)],
  });

  let rulerUsed = false;
  for (let i = 0; i < lineCount; i++) {
    const angle = rng() * TAU;
    const kind = !rulerUsed && i > 1 && rng() > 0.88 ? "ruler" : "line";
    rulerUsed ||= kind === "ruler";
    strokes.push({
      kind,
      x: 0.06 + rng() * 0.88,
      y: 0.06 + rng() * 0.88,
      angle,
      length: 0.2 + rng() * (0.34 + energy * 0.28),
      jitter: kind === "ruler" ? 0 : 0.006 + rng() * (0.014 + energy * 0.012),
      width: 0.65 + energy * 1.65 + rng() * 1.1,
      speed: 0.65 + energy * 0.75 + rng() * 0.55,
      palette: palette[Math.floor(rng() * palette.length)],
    });
  }

  strokes.splice(1 + Math.floor(rng() * strokes.length), 0, {
    kind: "dot",
    x: 0.12 + rng() * 0.76,
    y: 0.12 + rng() * 0.76,
    radius: 0.006 + rng() * (0.008 + energy * 0.006),
    width: 1,
    speed: 1,
    palette: "accent",
  });

  return {
    seed: seed >>> 0,
    noiseSeed: Math.floor(rng() * 0xffffffff) >>> 0,
    energy,
    palette,
    strokes,
  };
}

export function strokePoints(stroke, noiseSeed, progress) {
  const amount = clamp01(progress);
  if (!stroke || amount <= 0) return [];
  if (stroke.kind === "dot") return [{ x: stroke.x, y: stroke.y, radius: stroke.radius }];

  const fullSamples = stroke.kind === "circle"
    ? Math.max(28, Math.round(stroke.radius * 240))
    : Math.max(18, Math.round(stroke.length * 150));
  const samples = Math.max(2, Math.ceil(fullSamples * amount));
  const points = [];

  for (let i = 0; i < samples; i++) {
    const t = i / fullSamples;
    if (stroke.kind === "circle") {
      const angle = stroke.startAngle + stroke.arc * t;
      const wobble = (fbm(t * 5, stroke.cx + stroke.cy, noiseSeed, 3) - 0.5) * 0.018;
      const radius = Math.max(0, stroke.radius + wobble);
      points.push({ x: stroke.cx + Math.cos(angle) * radius, y: stroke.cy + Math.sin(angle) * radius });
      continue;
    }

    const distance = stroke.length * t;
    const jitter = stroke.kind === "ruler"
      ? 0
      : (fbm(t * 7, stroke.x + stroke.y, noiseSeed, 4) - 0.5) * stroke.jitter * 2;
    points.push({
      x: stroke.x + Math.cos(stroke.angle) * distance - Math.sin(stroke.angle) * jitter,
      y: stroke.y + Math.sin(stroke.angle) * distance + Math.cos(stroke.angle) * jitter,
    });
  }
  return points;
}

function average(data, from, to) {
  if (to <= from) return 0;
  let sum = 0;
  for (let i = from; i < to; i++) sum += data[i] / 255;
  return sum / (to - from);
}

export function audioFeatures(freqData, prevFeatures = null) {
  const data = freqData || [];
  const size = data.length;
  if (!size) return { bass: 0, mid: 0, treble: 0, rms: 0, flux: 0 };

  const bassEnd = Math.max(1, Math.floor(size * 0.1));
  const midEnd = Math.max(bassEnd + 1, Math.floor(size * 0.45));
  const bass = clamp01(average(data, 0, bassEnd));
  const mid = clamp01(average(data, bassEnd, midEnd));
  const treble = clamp01(average(data, midEnd, size));
  let squareSum = 0;
  let positiveChange = 0;
  const previous = prevFeatures?.spectrum || prevFeatures?.freqData;
  for (let i = 0; i < size; i++) {
    const normalized = data[i] / 255;
    squareSum += normalized * normalized;
    if (previous?.length === size) positiveChange += Math.max(0, data[i] - previous[i]) / 255;
  }
  const features = {
    bass,
    mid,
    treble,
    rms: clamp01(Math.sqrt(squareSum / size)),
    flux: previous?.length === size ? clamp01(positiveChange / size) : 0,
  };
  // Keep the public enumerable shape to the five documented features while
  // carrying the previous spectrum into the next flux calculation.
  Object.defineProperty(features, "spectrum", { value: Uint8Array.from(data) });
  return features;
}
