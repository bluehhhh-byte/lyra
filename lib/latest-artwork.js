import { emotionPoint } from "./emotion-model.js";

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const EMOTION_COLORS = {
  사랑: "ROSE",
  설렘: "ROSE",
  그리움: "SLATE",
  이별: "PLUM",
  슬픔: "SLATE",
  고독: "PLUM",
  위로: "TEAL",
  희망: "SAGE",
  기쁨: "OCHRE",
  분노: "CLAY",
  저항: "OCHRE",
  불안: "SAGE",
  체념: "STEEL",
  회상: "GOLD",
  몽환: "PLUM",
};

const FALLBACK_COLORS = ["SLATE", "ROSE", "TEAL", "OCHRE", "SAGE"];

export function hashLatest(value) {
  let hash = 2166136261;
  for (const char of String(value || "lyra-latest-day")) {
    hash ^= char.charCodeAt(0);
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

// 최신 업로드 일의 감정 좌표를 작은 별자리로 번역한다. 같은 날의 같은 기록에는
// 같은 장면이 나오고, 새 업로드로 날짜·감정·대표작이 바뀌면 구도도 함께 바뀐다.
export function latestArtworkPlan(latest = {}) {
  const source = [
    latest.day,
    latest.text,
    latest.dominant,
    latest.center?.v,
    latest.center?.a,
    latest.entropy,
    ...(latest.emotions || []).flat(),
    ...(latest.keywords || []).flat(),
    ...(latest.themes || []).flat(),
    latest.repSong?.slug,
    latest.repMovie?.slug,
  ].filter((value) => value !== undefined && value !== null && value !== "").join(" | ") || "lyra-latest-day";
  const seed = hashLatest(source);
  const random = mulberry32(seed);
  const rows = (latest.emotions || []).slice(0, 5);
  const maxCount = Math.max(1, ...rows.map(([, count]) => count));

  const nodes = rows.map(([emotion, count], index) => {
    const point = emotionPoint(emotion);
    return {
      emotion,
      count,
      color: EMOTION_COLORS[emotion] || FALLBACK_COLORS[index % FALLBACK_COLORS.length],
      x: 16 + ((point.v + 3) / 6) * 68 + (random() - 0.5) * 5,
      y: 16 + ((3 - point.a) / 6) * 61 + (random() - 0.5) * 5,
      radius: 5 + (count / maxCount) * 9,
      energy: clamp((point.a + 3) / 6),
    };
  });

  if (!nodes.length) {
    const count = Math.max(2, Math.min(4, (latest.movies || 0) + (latest.music || 0)));
    for (let index = 0; index < count; index++) {
      nodes.push({
        emotion: "",
        count: 1,
        color: FALLBACK_COLORS[(seed + index) % FALLBACK_COLORS.length],
        x: 20 + random() * 60,
        y: 18 + random() * 55,
        radius: 7 + random() * 5,
        energy: random(),
      });
    }
  }

  return {
    seed,
    nodes,
    center: {
      x: 16 + (((latest.center?.v ?? 0) + 3) / 6) * 68,
      y: 16 + ((3 - (latest.center?.a ?? 0)) / 6) * 61,
    },
    entropy: clamp(latest.entropy ?? 0),
    tallyCount: Math.min(12, Math.max(1, (latest.music || 0) + (latest.movies || 0))),
    keywordCount: Math.min(3, (latest.keywords || []).length + (latest.themes || []).length),
  };
}
