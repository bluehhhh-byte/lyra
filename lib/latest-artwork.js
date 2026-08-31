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

// 작품 제목과 해설에 쓰는 수사 — "두 번", "여덟 겹". 열을 넘으면 숫자로 쓴다.
const NATIVE = ["", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉", "열"];
export function koCount(count, counter) {
  const n = Math.max(0, Math.round(count));
  if (n === 0) return `${counter} 없음`;
  return n <= 10 ? `${NATIVE[n]} ${counter}` : `${n}${counter}`;
}

const koDate = (day) => {
  const [y, m, d] = String(day || "").split("-").map(Number);
  return y && m && d ? `${y}년 ${m}월 ${d}일` : "";
};

// 밝기(valence -3..3)를 빗금의 기울기로 옮긴다. 어두우면 내려가고 밝으면 올라간다.
// 캔버스는 y가 아래로 자라므로 음수 각이 오른쪽 위로 향하는 선이다.
export const valenceAngle = (v) => -(clamp((v + 3) / 6) - 0.5) * (Math.PI / 1.6);
const degrees = (radians) => Math.round((-radians * 180) / Math.PI);
const one = (value) => (Number.isFinite(value) ? value.toFixed(1) : "0.0");

// 그날 감정 중심이 그림에 마지막으로 덧입히는 층 — 날씨.
function weatherOf(center) {
  if (!center || !Number.isFinite(center.v) || !Number.isFinite(center.a)) return null;
  if (center.v <= -1.2) return "rain";
  if (center.a >= 1.2) return "spatter";
  if (center.v >= 1.2 && center.a <= 0.2) return "growth";
  return null;
}

// 지시문 목록. 그날의 기록이 자격을 만족하는 지시문 가운데 하나를 시드로 고른다.
// 기록의 모양이 같은 날이라도 시드가 다르면 다른 지시문이 나온다 — 그래서 매번 다른
// 작품이 되고, 같은 기록에는 언제나 같은 작품이 나온다.
//
// 각 지시문은 (1) 자격 (2) 그림에 필요한 수치 (3) 벽면 라벨을 만든다. 라벨은
// 미술관의 작품 설명처럼 쓴다 — 보이는 것, 만든 규칙, 제목의 뜻. 사람을 판정하지 않는다.
const SCORES = [
  {
    id: "constellation",
    eligible: (c) => c.distinct >= 3,
    params: () => ({}),
    label: (c) => ({
      title: `《${koCount(c.distinct, "별")}》`,
      body: `별 ${koCount(c.distinct, "개")}는 이날 기록된 감정의 수다. 자리는 각 감정의 밝기와 고조가 정하고 크기는 그 감정으로 남은 기록의 수를 따른다 — 가장 큰 별이 ${c.dominant}이다. 별을 잇는 한 획은 기록된 순서다.`,
    }),
  },
  {
    id: "repeat",
    eligible: (c) => c.distinct === 1 && c.records >= 2,
    params: (c) => ({
      rows: Math.min(12, c.records),
      markKind: c.energy >= 0.66 ? "spark" : c.energy >= 0.33 ? "ring" : "stroke",
    }),
    label: (c, p) => ({
      title: `《${c.dominant}, ${koCount(c.records, "번")}》`,
      body: `가로줄 ${koCount(c.records, "개")}가 화면을 가로지르고 줄마다 같은 ${{ spark: "불꽃", ring: "고리", stroke: "획" }[p.markKind]}이 같은 간격으로 되풀이된다. 이날의 기록 ${c.records}건은 모두 ${c.dominant}으로 남았다 — 줄 하나가 기록 하나다. 되풀이는 강조가 아니라 사실의 기록이다.`,
    }),
  },
  {
    id: "solo",
    eligible: (c) => c.records <= 1,
    params: (c) => ({ fraction: 0.55 + 0.4 * c.energy }),
    label: (c, p) => ({
      title: c.dominant ? `《열린 원 — ${c.dominant}》` : "《열린 원》",
      body: `붓은 원을 ${Math.round(p.fraction * 100)}% 그리고 멈춘다. 하나뿐인 기록은 별자리를 이루지 못하므로 이날은 원 하나로 남는다. 원이 얼마나 닫히는가는 그 기록의 고조가 정한다 — 고요할수록 원은 더 열려 있다.`,
    }),
  },
  {
    id: "pair",
    eligible: (c) => c.distinct === 2,
    params: (c) => {
      const [first, second] = c.nodes;
      const field = (node) => ({ emotion: node.emotion, count: node.count, color: node.color, angle: node.angle, spacing: 6 + (1 - node.count / c.maxCount) * 7 });
      return { seam: clamp(first.count / (first.count + second.count), 0.3, 0.7), left: field(first), right: field(second) };
    },
    label: (c, p) => ({
      title: `《${withParticle(p.left.emotion, "과", "와")} ${p.right.emotion}》`,
      body: `찢긴 선이 화면을 둘로 나눈다. 왼쪽 빗금은 ${p.left.emotion}의 기울기(${degrees(p.left.angle)}°)를, 오른쪽은 ${p.right.emotion}의 기울기(${degrees(p.right.angle)}°)를 따르고, 면의 넓이는 각 감정으로 남은 기록의 수에 비례한다(${p.left.count} 대 ${p.right.count}). 두 면은 맞닿지만 섞이지 않는다.`,
    }),
  },
  {
    id: "strata",
    eligible: (c) => c.records >= 3,
    params: (c) => ({ bands: Math.min(14, c.records) }),
    label: (c) => ({
      title: `《${koCount(c.records, "겹")}》`,
      body: `기록 ${c.records}건이 아래에서 위로 한 겹씩 쌓였다. 겹의 색은 그 기록의 감정이고 빗금의 기울기는 감정의 밝기다. 두께는 모두 같다 — 이 작업에서 하루의 기록은 같은 무게를 갖는다.`,
    }),
  },
  {
    id: "grid",
    eligible: (c) => c.records >= 2,
    params: (c) => {
      const cells = Math.min(24, c.records);
      const rows = Math.ceil(Math.sqrt(cells * 0.7));
      return { cells, rows, cols: Math.ceil(cells / rows) };
    },
    label: (c, p) => ({
      title: `《네 방향의 선, ${koCount(p.cells, "칸")}》`,
      body: `칸 ${p.cells}개는 이날의 기록 수다. 칸마다 선은 수직·수평·두 대각선 가운데 하나로만 긋고 그 방향은 칸의 자리가 정한다. 색만 기록의 감정에서 온다. 규칙은 단순하고, 그림은 규칙이 허락하는 만큼만 다르다.`,
    }),
  },
  {
    id: "rain",
    eligible: (c) => c.v <= -1,
    params: (c) => ({ drops: Math.min(24, Math.max(6, c.records * 4)) }),
    label: (c, p) => ({
      title: `《비, ${koCount(p.drops, "줄")}》`,
      body: `잉크 ${p.drops}줄이 위에서 아래로 흘러내린다. 이날 기록의 밝기는 ${one(c.v)}으로, 이 아카이브의 척도(−3에서 3)에서 어두운 쪽이다. 줄의 수는 기록 ${c.records}건에 넷을 곱한 것이고 길이는 붓이 멈춘 자리다.`,
    }),
  },
  {
    id: "burst",
    eligible: (c) => c.a >= 1,
    params: (c) => ({ spokes: Math.min(40, Math.max(8, c.records + c.keywords)) }),
    label: (c, p) => ({
      title: c.dominant ? `《${c.dominant}, 터짐》` : "《터짐》",
      body: `한 점에서 사방으로 획 ${p.spokes}개가 뻗는다. 획의 수는 이날의 기록과 낱말을 합한 것이고 뻗는 길이는 감정의 고조(${one(c.a)})를 따른다. 가운데는 비어 있다 — 터진 것은 자리를 남기지 않는다.`,
    }),
  },
  {
    id: "growth",
    eligible: (c) => c.v >= 1 && c.a <= 0.5,
    params: (c) => ({ stalks: Math.min(12, Math.max(1, c.records)) }),
    label: (c, p) => ({
      title: `《${koCount(p.stalks, "포기")}》`,
      body: `풀 ${p.stalks}포기가 아래에서 자란다. 한 포기가 기록 하나이고 키는 그 감정의 밝기다. 밝고 고요한 날에만 주어지는 지시문이다 — 이날의 밝기 ${one(c.v)}, 고조 ${one(c.a)}.`,
    }),
  },
  {
    id: "letters",
    eligible: (c) => c.keywords >= 3,
    params: (c) => ({ marks: Math.min(9, c.keywords) }),
    label: (c, p) => ({
      title: `《읽을 수 없는 편지, ${koCount(p.marks, "낱말")}》`,
      body: `글자처럼 보이지만 읽을 수 없는 줄이 종이를 채운다. 그 가운데 밑줄 그은 자리 ${p.marks}곳은 이날의 기록에 붙은 낱말의 수다. 무엇이라 쓰였는지는 알 수 없고 얼마나 쓰였는지만 남는다.`,
    }),
  },
  {
    id: "thread",
    eligible: (c) => c.records >= 2,
    params: (c) => ({ knots: Math.min(12, c.records) }),
    label: (c, p) => ({
      title: `《한 가닥, ${koCount(p.knots, "매듭")}》`,
      body: `한 가닥의 실이 화면을 지나며 ${koCount(p.knots, "번")} 매듭을 짓는다. 매듭은 이날의 기록이고 실은 그 사이의 시간이다. 실은 끊기지 않는다 — 기록과 기록 사이에도 하루는 이어진다.`,
    }),
  },
];

const WEATHER_SCORES = new Set(["rain", "burst", "growth"]);

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
      v: point.v,
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
        v: 0,
      });
    }
  }

  const records = (latest.music || 0) + (latest.movies || 0);
  const keywordTotal = (latest.keywords || []).length + (latest.themes || []).length;
  const context = {
    records,
    distinct: rows.length,
    dominant: rows[0]?.[0] || "",
    nodes,
    maxCount,
    energy: nodes[0] ? nodes[0].energy : 0.5,
    v: Number.isFinite(latest.center?.v) ? latest.center.v : 0,
    a: Number.isFinite(latest.center?.a) ? latest.center.a : 0,
    keywords: keywordTotal,
  };

  // 자격이 있는 지시문 가운데 시드가 하나를 고른다. 아무것도 자격이 없으면 원 하나.
  const eligible = SCORES.filter((score) => score.eligible(context));
  const chosen = eligible.length ? eligible[seed % eligible.length] : SCORES.find((score) => score.id === "solo");
  const params = chosen.params(context);
  const label = chosen.label(context, params);
  const weather = WEATHER_SCORES.has(chosen.id) ? null : weatherOf(latest.center);
  const weatherCount = weather === "rain" ? Math.min(8, 3 + records) : weather === "growth" ? Math.min(6, 2 + records) : 2;
  const weatherNote =
    weather === "rain" ? ` 위에서 흘러내린 잉크 ${koCount(weatherCount, "줄")}은 이날의 어두운 밝기(${one(context.v)})다.`
    : weather === "spatter" ? ` 흩뿌려진 잉크는 이날의 높은 고조(${one(context.a)})다.`
    : weather === "growth" ? ` 아래쪽의 풀 ${weatherCount}포기는 밝고 고요했던 이날의 표식이다.`
    : "";

  // 감정 tally를 기록 하나하나에 나눠 붙인 목록 — 층·격자·실이 기록 단위로 색을 고를 때 쓴다
  const perRecord = [];
  for (const node of nodes) for (let index = 0; index < node.count && perRecord.length < 24; index++) perRecord.push(node);
  while (perRecord.length < Math.min(24, Math.max(1, records))) perRecord.push(nodes[perRecord.length % nodes.length]);

  const year = String(latest.day || "").slice(0, 4);
  return {
    seed,
    score: chosen.id,
    title: label.title,
    year,
    medium: `종이에 잉크, 지시문 드로잉 · ${koDate(latest.day) || "날짜 없음"} · 기록 ${records}건`,
    body: label.body + weatherNote,
    weather,
    weatherCount,
    variant: seed % 3,
    angle: valenceAngle(context.v),
    params,
    perRecord,
    nodes,
    center: {
      x: 16 + ((context.v + 3) / 6) * 68,
      y: 16 + ((3 - context.a) / 6) * 61,
    },
    entropy: clamp(latest.entropy ?? 0),
    tallyCount: Math.min(12, Math.max(1, records)),
    keywordCount: Math.min(3, keywordTotal),
  };
}
