// 감정 원형 좌표와 아카이브 정서 유형 — Russell의 Circumplex Model of Affect를
// 참고해 15개 감정 어휘를 valence(어두움↔밝음)·arousal(고요함↔고조됨) 평면에 놓는다.
// 좌표의 근거와 한계는 docs/EMOTION-MODEL.md에 있다.
//
// 이 좌표는 기록의 정서적 색을 읽기 위한 근사값이지 심리검사가 아니다. 결과 문장의
// 주어는 언제나 '이달의 기록'이지 사람이 아니다 — 사람을 판정하는 문구를 여기서
// 만들지 않는다.
import { parseEmotion, emotionValence } from "./keywords.js";

// valence는 keywords.js의 EMOTION_VALENCE(-3..3)를 그대로 쓴다 — 다이어리 세로축과
// 같은 값이어야 두 화면이 같은 곡을 다르게 놓지 않는다. arousal만 여기서 정의한다.
// 범위 -3(고요함)..+3(고조됨).
export const EMOTION_AROUSAL = {
  기쁨: 2, 사랑: 1, 희망: 1, 설렘: 2, 위로: -2,
  회상: -2, 몽환: -1,
  그리움: -1, 체념: -3, 저항: 3,
  불안: 2, 고독: -2, 분노: 3,
  슬픔: -2, 이별: -1,
};
export const AROUSAL_RANGE = [-3, 3];

export const emotionArousal = (e) => EMOTION_AROUSAL[parseEmotion(e)] ?? 0;
export const emotionPoint = (e) => ({ v: emotionValence(e), a: emotionArousal(e) });

// 감정들의 가중 중심 — 한 달의 곡들이 평면 어디에 모이는지.
// 감정이 없는 곡은 중심을 0으로 끌지 않도록 아예 세지 않는다.
export function emotionCenter(emotions) {
  const pts = emotions.map(parseEmotion).filter(Boolean).map(emotionPoint);
  if (!pts.length) return null;
  return {
    v: pts.reduce((s, p) => s + p.v, 0) / pts.length,
    a: pts.reduce((s, p) => s + p.a, 0) / pts.length,
    n: pts.length,
  };
}

// Shannon entropy를 최대값(모든 감정이 고르게)으로 나눈 0..1 값.
// 0 = 한 감정에 집중, 1 = 여러 감정이 고르게 혼재.
export function emotionEntropy(counts) {
  const ns = counts.map(([, n]) => n).filter((n) => n > 0);
  const total = ns.reduce((s, n) => s + n, 0);
  if (!total || ns.length < 2) return 0;
  const h = -ns.reduce((s, n) => s + (n / total) * Math.log2(n / total), 0);
  return h / Math.log2(ns.length);
}

// 사용자에게는 수식 대신 읽히는 말로 — 경계값은 EMOTION-MODEL.md에 기록
export function diversityLabel(counts) {
  const distinct = counts.filter(([, n]) => n > 0).length;
  if (distinct <= 1) return "한 감정에 집중";
  const h = emotionEntropy(counts);
  if (distinct <= 3 || h < 0.6) return "두세 감정이 교차";
  return "여러 감정이 혼재";
}

// 아카이브 정서 유형 — 연속 좌표에서 파생되는 설명형 라벨.
// MBTI처럼 읽히지만 고정 성격이 아니라 그 달 기록의 위치다. 표본이 적으면(3곡 미만)
// 단정하지 않는다. 중립 부근(|v|,|a| < 0.5)은 사분면에 억지로 넣지 않는다.
export const MOOD_NEUTRAL_BAND = 0.5;
export const MOOD_MIN_SAMPLE = 3;

// 달의 성격은 각성 축만 읽는다. 중립 부근의 작은 차이를 이름 붙이지 않도록
// ±0.75 바깥만 조용함/고조됨으로 구분하고, 그 사이는 완만함으로 둔다.
export const MONTH_CHARACTER_THRESHOLD = 0.75;

export function monthCharacterLabel(center) {
  if (!center || center.n < MOOD_MIN_SAMPLE) return "";
  if (center.a >= MONTH_CHARACTER_THRESHOLD) return "고조된 기록의 달";
  if (center.a <= -MONTH_CHARACTER_THRESHOLD) return "조용한 기록의 달";
  return "완만한 기록의 달";
}

export function moodType(center, { entropy = 0 } = {}) {
  if (!center || center.n < MOOD_MIN_SAMPLE) return "판단 유보";
  const { v, a } = center;
  const T = MOOD_NEUTRAL_BAND;
  if (Math.abs(v) < T && Math.abs(a) < T) return entropy >= 0.75 ? "복합 정서" : "몽환적 유예";
  if (Math.abs(v) < T) return a > 0 ? "흔들리는 탐색" : "몽환적 유예";
  if (v > 0) return a >= 0 ? "밝은 확장" : "고요한 회복";
  return a >= 0 ? "긴장된 저항" : "깊은 침잠";
}

// 이전 달 대비 이동을 말로 — 0.4 미만 변화는 '비슷함'으로 둔다(잡음까지 서사화하지 않는다)
export const MOVE_THRESHOLD = 0.4;
export function moveLabel(prev, curr) {
  if (!prev || !curr) return "";
  const dv = curr.v - prev.v;
  const da = curr.a - prev.a;
  const parts = [];
  if (dv > MOVE_THRESHOLD) parts.push("밝아지는 중");
  else if (dv < -MOVE_THRESHOLD) parts.push("어두워지는 중");
  if (da > MOVE_THRESHOLD) parts.push("각성도 상승");
  else if (da < -MOVE_THRESHOLD) parts.push("각성도 하강");
  return parts.join(" · ") || "이전 달과 비슷함";
}

// 원형 배치 각도 — 감정 구성 차트가 원 둘레에 감정을 놓을 때 circumplex 위치를 쓴다.
// 가나다순·사용량순 배치는 인접성이 의미를 잃는다. atan2(a, v)라 '기쁨'(+v,+a)은
// 오른쪽 위, '슬픔'(-v,-a)은 왼쪽 아래로 간다.
export const emotionAngle = (e) => {
  const { v, a } = emotionPoint(e);
  return Math.atan2(a, v);
};

// 좌표가 같은 방향인 감정들(고독 -2,-2 과 그리움 -1,-1 은 각도가 같다)은 원 둘레에서
// 정확히 포개진다. 배치할 때만 살짝 벌린다 — 모델 값은 건드리지 않는다.
const SPREAD = 0.2; // rad
export function emotionAngles(emotions) {
  const byAngle = new Map();
  for (const e of emotions) {
    const key = emotionAngle(e).toFixed(4);
    if (!byAngle.has(key)) byAngle.set(key, []);
    byAngle.get(key).push(e);
  }
  const out = new Map();
  for (const [key, group] of byAngle) {
    const base = Number(key);
    group.forEach((e, i) => out.set(e, base + (i - (group.length - 1) / 2) * SPREAD));
  }
  return out;
}
