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

// 그날 감정 중심이 그림에 마지막으로 덧입히는 층 — 날씨.
function weatherOf(center) {
  if (!center || !Number.isFinite(center.v) || !Number.isFinite(center.a)) return null;
  if (center.v <= -1.2) return "rain";
  if (center.a >= 1.2) return "spatter";
  if (center.v >= 1.2 && center.a <= 0.2) return "growth";
  return null;
}

// 지시문 목록. 그날의 기록이 자격을 만족하는 지시문 가운데 하나를 시드로 고른다.
// 기본 지시문 다섯 종은 어떤 기록에도 그릴 수 있게 두어, 최근 작품 세 종을 제외해도
// 반드시 새 패턴이 남는다. 같은 기록에는 언제나 같은 작품이 나온다.
//
// 각 지시문은 (1) 자격 (2) 그림에 필요한 수치 (3) 벽면 라벨을 만든다. 수치는 제작에만
// 쓰고 라벨은 완성된 형상과 여백이 무엇을 환기하는지 읽는 짧은 미술 평론으로 쓴다.
const SCORES = [
  {
    id: "constellation",
    eligible: (c) => c.distinct >= 3,
    params: () => ({}),
    label: (c) => ({
      title: `《${koCount(c.distinct, "별")}》`,
      body: `서로 다른 별들은 한 화면에 머물면서도 하나의 모양으로 닫히지 않는다. 그 사이를 가로지르는 가느다란 선은 감정을 분류하기보다, 낯선 기분들이 잠시 이웃했던 순간을 붙든다.`,
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
      body: `같은 ${{ spark: "불꽃", ring: "고리", stroke: "획" }[p.markKind]}이 수평의 침묵 속에서 되돌아온다. 반복은 감정을 강조하지 않는다. 오히려 빠져나가지 못한 마음이 같은 자리를 조금씩 다르게 통과하는 모습을 보여준다.`,
    }),
  },
  {
    id: "solo",
    eligible: (c) => c.records >= 1,
    params: (c) => ({ fraction: 0.55 + 0.4 * c.energy }),
    label: (c, p) => ({
      title: c.dominant ? `《열린 원 — ${c.dominant}》` : "《열린 원》",
      body: `끝내 닫히지 않은 원은 결핍보다 가능성에 가깝다. 멈춘 붓끝과 비어 있는 틈은 하나의 감정이 완결된 의미로 굳어지는 순간을 조용히 미룬다.`,
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
      body: `찢긴 경계 양쪽의 빗금은 서로를 향하지만 섞이지 않는다. ${p.left.emotion}과 ${p.right.emotion}은 대립하는 두 면이 아니라, 한 장의 종이 안에서 동시에 머물 수밖에 없는 감정의 이중 초상이다.`,
    }),
  },
  {
    id: "strata",
    eligible: (c) => c.records >= 1,
    params: (c) => ({ bands: Math.min(14, Math.max(1, c.records)) }),
    label: (c) => ({
      title: `《${koCount(c.records, "겹")}》`,
      body: `겹쳐진 띠들은 아래의 흔적을 완전히 가리지 못한다. 하루가 단일한 장면이 아니라 서로 다른 시간이 얇게 포개진 표면이라는 사실이 층과 층 사이에서 드러난다.`,
    }),
  },
  {
    id: "grid",
    eligible: (c) => c.records >= 1,
    params: (c) => {
      const cells = Math.min(24, c.records);
      const rows = Math.ceil(Math.sqrt(cells * 0.7));
      return { cells, rows, cols: Math.ceil(cells / rows) };
    },
    label: (c, p) => ({
      title: `《네 방향의 선, ${koCount(p.cells, "칸")}》`,
      body: `엄격한 격자는 감정을 정돈하려 하지만, 칸마다 엇갈린 선은 질서에 순순히 복종하지 않는다. 규칙과 흔들림이 맞부딪치는 표면에서 하루의 불균형이 모습을 얻는다.`,
    }),
  },
  {
    id: "rain",
    eligible: (c) => c.v <= -1,
    params: (c) => ({ drops: Math.min(24, Math.max(6, c.records * 4)) }),
    label: (c, p) => ({
      title: `《비, ${koCount(p.drops, "줄")}》`,
      body: `위에서 흘러내린 잉크는 비를 묘사하기보다 표면이 견디지 못한 무게를 드러낸다. 제각기 다른 자리에서 멈춘 검은 흔적은 사라짐에도 저마다의 시간이 있음을 말한다.`,
    }),
  },
  {
    id: "burst",
    eligible: (c) => c.a >= 1,
    params: (c) => ({ spokes: Math.min(40, Math.max(8, c.records + c.keywords)) }),
    label: (c, p) => ({
      title: c.dominant ? `《${c.dominant}, 터짐》` : "《터짐》",
      body: `획들은 빈 중심에서 사방으로 달아난다. 폭발의 원인은 지워지고 운동의 흔적만 남아, 감정이 하나의 대상이 아니라 이미 지나가 버린 힘이었다는 사실을 보여준다.`,
    }),
  },
  {
    id: "growth",
    eligible: (c) => c.v >= 1 && c.a <= 0.5,
    params: (c) => ({ stalks: Math.min(12, Math.max(1, c.records)) }),
    label: (c, p) => ({
      title: `《${koCount(p.stalks, "포기")}》`,
      body: `가느다란 줄기들은 빈 종이의 아래쪽을 더듬으며 천천히 위를 향한다. 성장은 완성된 형상이 아니라, 아직 이름 붙지 않은 움직임이 공간을 조금씩 차지하는 과정으로 남는다.`,
    }),
  },
  {
    id: "letters",
    eligible: (c) => c.records >= 1,
    params: (c) => ({ marks: Math.max(1, Math.min(12, c.keywords)) }),
    label: (c, p) => ({
      title: c.keywords ? `《읽을 수 없는 편지, ${koCount(p.marks, "낱말")}》` : "《읽을 수 없는 편지, 한 흔적》",
      body: `글자를 닮은 선들은 읽히기 직전에 의미를 놓친다. 밑줄은 중요한 말을 가리키는 대신 이미 사라진 문장을 증언하며, 기억과 언어 사이의 간격을 넓힌다.`,
    }),
  },
  {
    id: "thread",
    eligible: (c) => c.records >= 1,
    params: (c) => ({ knots: Math.min(12, Math.max(1, c.records)) }),
    label: (c, p) => ({
      title: `《한 가닥, ${koCount(p.knots, "매듭")}》`,
      body: `한 가닥의 선은 매듭을 통과할 때마다 잠시 머뭇거린다. 이어짐은 매끄러운 연속이 아니라, 멈춤과 얽힘을 품은 채 가까스로 다음 자리로 나아가는 시간의 모습이다.`,
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
  const imageWords = [...(latest.keywords || []), ...(latest.themes || [])]
    .map(([word]) => String(word || "").trim())
    .filter((word, index, words) => word && words.indexOf(word) === index)
    .slice(0, 3);
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
    imageWords,
  };

  // 앞선 기록일 세 날의 지시문을 먼저 걷어내고 남은 후보에서 고른다. 기본 지시문이
  // 다섯 종이라 정상 기록에는 언제나 새 후보가 있으며, 직접 호출 때도 결정적이다.
  const eligible = SCORES.filter((score) => score.eligible(context));
  const avoided = new Set((latest.artworkAvoid || []).filter(Boolean));
  const fresh = eligible.filter((score) => !avoided.has(score.id));
  const candidates = fresh.length ? fresh : eligible;
  const chosen = candidates.length ? candidates[seed % candidates.length] : SCORES.find((score) => score.id === "solo");
  const params = chosen.params(context);
  const label = chosen.label(context, params);
  const weather = WEATHER_SCORES.has(chosen.id) ? null : weatherOf(latest.center);
  const weatherCount = weather === "rain" ? Math.min(8, 3 + records) : weather === "growth" ? Math.min(6, 2 + records) : 2;
  const weatherNote =
    weather === "rain" ? " 흘러내린 잉크는 화면의 침묵을 아래로 길게 끌어내린다."
    : weather === "spatter" ? " 흩뿌려진 점들은 단정한 형상 밖으로 빠져나간 순간의 힘을 남긴다."
    : weather === "growth" ? " 아래에서 돋은 가는 선들은 비어 있던 공간에 조용한 생기를 건넨다."
    : "";
  const signatureWords = [...imageWords.slice(0, 2), context.dominant]
    .filter((word, index, words) => word && words.indexOf(word) === index && !label.title.includes(word));
  const signedTitle = signatureWords.length
    ? label.title.replace(/》$/, ` · ${signatureWords.join("·")}》`)
    : label.title;
  const representative = latest.repSong?.title || latest.repMovie?.title || "";
  const signatureNote = imageWords.length
    ? ` ${imageWords.map((word) => `‘${word}’`).join("·")}의 흔적${representative ? `과 「${representative}」의 잔향` : ""}은 이 날짜에만 가능한 간격과 방향을 화면에 남긴다.`
    : representative
      ? ` 「${representative}」의 잔향은 이 날짜에만 가능한 간격과 방향을 화면에 남긴다.`
      : "";

  // 감정 tally를 기록 하나하나에 나눠 붙인 목록 — 층·격자·실이 기록 단위로 색을 고를 때 쓴다
  const perRecord = [];
  for (const node of nodes) for (let index = 0; index < node.count && perRecord.length < 24; index++) perRecord.push(node);
  while (perRecord.length < Math.min(24, Math.max(1, records))) perRecord.push(nodes[perRecord.length % nodes.length]);

  const year = String(latest.day || "").slice(0, 4);
  return {
    seed,
    score: chosen.id,
    title: signedTitle,
    year,
    medium: `종이에 잉크, 지시문 드로잉 · ${koDate(latest.day) || "날짜 없음"}`,
    body: label.body + signatureNote + weatherNote,
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
