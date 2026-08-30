const TAU = Math.PI * 2;
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

export function hashReport(value) {
  let hash = 2166136261;
  const text = String(value || "lyra-report");
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const BRIGHT = ["밝", "희망", "사랑", "위로", "봄", "하늘", "빛"];
const DARK = ["어둠", "서늘", "밤", "눈물", "불안", "체념", "이별", "고독"];
const ENERGETIC = ["록", "힙합", "저항", "격정", "리듬", "펑크", "메탈", "댄스"];
const CALM = ["고요", "평형", "발라드", "포크", "재즈", "몽환", "정경"];

function wordHits(text, words) {
  return words.reduce((total, word) => total + (text.includes(word) ? 1 : 0), 0);
}

// 저장된 AI 리포트의 언어가 기본 구도를 만들고, 최신 기록의 정서 좌표가
// 높이·밀도·열림 정도를 보정한다. 같은 리포트에는 언제나 같은 그림이 나온다.
export function reportArtworkPlan({ report, latest, shift, taste } = {}) {
  const reportText = report?.text?.trim() || "";
  const source = [
    reportText,
    latest?.text,
    latest?.dominant,
    shift?.genre?.name,
    shift?.emotion?.name,
    taste?.decade?.[0]?.[0],
  ].filter(Boolean).join(" | ") || "lyra-report";
  const seed = hashReport(source);
  const rng = mulberry32(seed);

  const textValence = clamp(0.5 + (wordHits(reportText, BRIGHT) - wordHits(reportText, DARK)) * 0.045);
  const measuredValence = Number.isFinite(latest?.center?.v) ? clamp((latest.center.v + 3) / 6) : textValence;
  const valence = textValence * 0.64 + measuredValence * 0.36;

  const textEnergy = clamp(0.42 + (wordHits(reportText, ENERGETIC) - wordHits(reportText, CALM)) * 0.045);
  const measuredEnergy = Number.isFinite(latest?.center?.a) ? clamp((latest.center.a + 3) / 6) : textEnergy;
  const energy = textEnergy * 0.68 + measuredEnergy * 0.32;
  const diversity = clamp(latest?.entropy ?? 0.56);
  const shiftDelta = Number.isFinite(shift?.valenceRecent) && Number.isFinite(shift?.valenceAll)
    ? clamp((shift.valenceRecent - shift.valenceAll) / 2, -1, 1)
    : 0;

  // 의도적으로 3–5획만 둔다. 배경이 다시 정보보다 먼저 보이지 않게 하는 상한이다.
  const strokeCount = Math.min(5, 3 + Math.round(energy * 1.2 + diversity * 0.6));
  const rise = shiftDelta * -13;
  const strokes = Array.from({ length: strokeCount }, (_, index) => {
    const lane = (index + 1) / (strokeCount + 1);
    const startX = 3 + rng() * 14;
    const startY = 11 + lane * 72 + (rng() - 0.5) * 13;
    const endX = 78 + rng() * 19;
    const endY = clamp(startY + rise + (rng() - 0.5) * (18 + energy * 18), 6, 94);
    const bend = (rng() - 0.5) * (24 + diversity * 30);
    return {
      d: [
        `M ${startX.toFixed(2)} ${startY.toFixed(2)}`,
        `C ${(25 + rng() * 12).toFixed(2)} ${(startY + bend).toFixed(2)},`,
        `${(59 + rng() * 15).toFixed(2)} ${(endY - bend * 0.72).toFixed(2)},`,
        `${endX.toFixed(2)} ${endY.toFixed(2)}`,
      ].join(" "),
      width: (0.7 + energy * 1.25 + rng() * 0.55).toFixed(2),
      opacity: (0.34 + index * 0.075).toFixed(2),
      tone: index === strokeCount - 1 ? "ink" : "muted",
    };
  });

  const radius = 11 + diversity * 13;
  return {
    seed,
    metrics: { valence, energy, diversity, shift: shiftDelta },
    strokes,
    ring: {
      cx: 52 + (rng() - 0.5) * 24,
      cy: 69 - valence * 39 + (rng() - 0.5) * 8,
      radius,
      startAngle: rng() * TAU,
      arc: TAU * (0.79 + diversity * 0.12),
      width: 0.8 + energy * 1.1,
    },
    dot: {
      x: 17 + rng() * 66,
      y: 14 + rng() * 68,
      radius: 1.8 + energy * 2.2,
    },
  };
}
