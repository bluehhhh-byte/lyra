import { emotionPoint } from "./emotion-model.js";

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

export const EMOTION_COLORS = {
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

// 받침 유무로 조사를 고른다 — "불안과 사랑", "슬픔이", "분노가".
export function withParticle(word, withBatchim, withoutBatchim) {
  const text = String(word || "").trim();
  const code = text.charCodeAt(text.length - 1);
  const hangul = code >= 0xac00 && code <= 0xd7a3;
  const batchim = hangul && (code - 0xac00) % 28 !== 0;
  return `${text}${!hangul || batchim ? withBatchim : withoutBatchim}`;
}

// 밝기(valence -3..3)를 빗금의 기울기로 옮긴다. 어두우면 내려가고 밝으면 올라간다.
// 캔버스는 y가 아래로 자라므로 음수 각이 오른쪽 위로 향하는 선이다.
export const valenceAngle = (v) => -(clamp((v + 3) / 6) - 0.5) * (Math.PI / 1.6);
const degrees = (radians) => Math.round((-radians * 180) / Math.PI);

// 그날 감정 중심이 그림 전체에 마지막으로 덧입히는 층 — 날씨.
function weatherOf(center) {
  if (!center || !Number.isFinite(center.v) || !Number.isFinite(center.a)) return null;
  if (center.v <= -1.2) return "rain";
  if (center.a >= 1.2) return "spatter";
  if (center.v >= 1.2 && center.a <= 0.2) return "growth";
  return null;
}

// 그날의 기록이 지시문 넷 중 하나를 고른다. 지시문이 그림을 만들고, 제목과 해설은
// 그 규칙에서 나온다. 같은 기록이면 같은 작품이고, 기록의 모양이 달라지면 지시문이
// 달라져 다른 작품이 된다.
//
//   감정 3종 이상 → 별자리(constellation)  감정마다 별을 좌표에 놓고 잇는다
//   기록 1건      → 원 하나(solo)           별자리가 될 수 없는 날은 열린 원 하나
//   감정 1종      → 되풀이(repeat)          기록 수만큼 줄을 긋고 같은 표식을 반복
//   감정 2종      → 마주 봄(pair)           종이를 둘로 찢어 각자의 기울기로 빗금
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
      angle: valenceAngle(point.v),
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
        angle: 0,
      });
    }
  }

  const records = (latest.music || 0) + (latest.movies || 0);
  const distinct = rows.length;
  const day = latest.day || "";
  const lead = nodes[0];
  const energy = lead ? lead.energy : 0.5;
  const center = {
    x: 16 + (((latest.center?.v ?? 0) + 3) / 6) * 68,
    y: 16 + ((3 - (latest.center?.a ?? 0)) / 6) * 61,
  };
  const weather = weatherOf(latest.center);
  const variant = seed % 3;
  const angle = valenceAngle(latest.center?.v ?? 0);

  let score;
  let title;
  let instruction;
  let caption;
  let params = {};

  if (distinct >= 3) {
    score = "constellation";
    const [dominant, top] = rows[0];
    title = `《별 ${distinct}개 — ${dominant}》`;
    instruction = "감정마다 별을 하나씩 밝기·고조 좌표에 놓는다. 많이 기록된 감정일수록 크게, 고조된 감정은 빛나게 그린 뒤 한 획으로 잇는다.";
    caption = `${day}의 기록 ${records}건에 감정 ${distinct}종이 나타났다. ${withParticle(dominant, "이", "가")} ${top}건으로 가장 많다.`;
  } else if (records <= 1 || distinct === 0) {
    score = "solo";
    const fraction = 0.55 + 0.4 * energy;
    const emotion = lead?.emotion || "";
    params = { fraction, energy };
    title = emotion ? `《원 하나 — ${emotion}》` : "《원 하나》";
    instruction = `원을 하나 긋는다. 둘레의 ${Math.round(fraction * 100)}%에서 붓을 뗀다 — 기록이 고조될수록 원은 더 닫힌다.`;
    caption = records
      ? `${day}의 기록은 ${records}건뿐이다. 하나는 별자리를 이룰 수 없어 원 하나로 남긴다.`
      : `${day}에는 기록이 없다. 빈 날은 열린 원으로 남긴다.`;
  } else if (distinct === 1) {
    score = "repeat";
    const emotion = lead.emotion;
    const markKind = energy >= 0.66 ? "spark" : energy >= 0.33 ? "ring" : "stroke";
    const markName = { spark: "불꽃", ring: "고리", stroke: "획" }[markKind];
    params = { rows: Math.min(12, records), markKind };
    title = `《${emotion}, ${records}줄》`;
    instruction = `가로줄 ${records}개를 긋는다. 줄마다 ${emotion}의 ${withParticle(markName, "을", "를")} 오른쪽 끝에 닿을 때까지 되풀이한다.`;
    caption = `${day}의 기록 ${records}건이 전부 ${emotion}에 모였다. 같은 감정이 되풀이된 날은 같은 표식의 되풀이로 남긴다.`;
  } else {
    score = "pair";
    const [first, second] = nodes;
    const field = (node) => ({
      emotion: node.emotion,
      count: node.count,
      color: node.color,
      angle: node.angle,
      spacing: 6 + (1 - node.count / maxCount) * 8,
    });
    params = {
      seam: clamp(first.count / (first.count + second.count), 0.3, 0.7),
      left: field(first),
      right: field(second),
    };
    title = `《${withParticle(first.emotion, "과", "와")} ${second.emotion}》`;
    instruction = `종이를 찢어 둘로 나눈다. 왼쪽은 ${first.emotion}의 기울기 ${degrees(first.angle)}°로, 오른쪽은 ${second.emotion}의 기울기 ${degrees(second.angle)}°로 빗금을 채운다. 기록이 많은 쪽이 넓고 촘촘하다.`;
    caption = `${day}에 ${first.emotion} ${first.count}건과 ${second.emotion} ${second.count}건이 마주 본 날이다.`;
  }

  const weatherCount = weather === "rain" ? Math.min(9, 3 + records) : weather === "growth" ? Math.min(7, 2 + records) : 3;
  if (weather === "rain") instruction += ` 마지막으로 위에서 잉크를 ${weatherCount}줄 흘려보낸다 — 기록의 밝기가 ${latest.center.v.toFixed(1)}로 어두웠다.`;
  else if (weather === "spatter") instruction += ` 마지막으로 잉크를 튀긴다 — 기록의 고조가 ${latest.center.a.toFixed(1)}로 높았다.`;
  else if (weather === "growth") instruction += ` 마지막으로 아래쪽에 풀을 ${weatherCount}포기 세운다 — 밝고 고요한 날의 표식이다.`;

  return {
    seed,
    score,
    title,
    instruction,
    caption,
    weather,
    weatherCount,
    variant,
    angle,
    params,
    nodes,
    center,
    entropy: clamp(latest.entropy ?? 0),
    tallyCount: Math.min(12, Math.max(1, records)),
    keywordCount: Math.min(3, (latest.keywords || []).length + (latest.themes || []).length),
  };
}
