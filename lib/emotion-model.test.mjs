// 감정 좌표·정서 유형의 경계값 — docs/EMOTION-MODEL.md와 같은 규칙이어야 한다.
//   node lib/emotion-model.test.mjs
import assert from "node:assert/strict";
import { EMOTIONS } from "./keywords.js";
import {
  EMOTION_AROUSAL, AROUSAL_RANGE, emotionArousal, emotionPoint, emotionCenter,
  emotionEntropy, diversityLabel, emotionUsage, moodType, moveLabel, emotionAngle, emotionAngles,
  monthCharacterLabel, MOOD_NEUTRAL_BAND, MOOD_MIN_SAMPLE, MONTH_CHARACTER_THRESHOLD,
} from "./emotion-model.js";

// 15개 감정 전부에 arousal이 있고 범위 안이다 — 하나라도 빠지면 그 감정의 곡이
// 조용히 (v, 0)으로 눕는다
{
  const [lo, hi] = AROUSAL_RANGE;
  for (const e of EMOTIONS) {
    assert.ok(e in EMOTION_AROUSAL, `arousal 누락: ${e}`);
    const a = emotionArousal(e);
    assert.ok(a >= lo && a <= hi, `범위 밖: ${e}=${a}`);
  }
  assert.equal(emotionArousal("없는감정"), 0);
  // 방향 확인 — 분노는 고각성, 체념은 저각성, 위로는 저각성 긍정
  assert.ok(emotionArousal("분노") > 0 && emotionArousal("저항") > 0);
  assert.ok(emotionArousal("체념") < 0 && emotionArousal("위로") < 0);
  assert.ok(emotionPoint("기쁨").v > 0 && emotionPoint("기쁨").a > 0);
  assert.ok(emotionPoint("슬픔").v < 0 && emotionPoint("슬픔").a < 0);
}
console.log("✓ 15개 감정 valence·arousal 매핑");

// 사용 빈도 — 모델의 15개 어휘를 모두 보여 주고 미사용 어휘도 0으로 남긴다
{
  const usage = emotionUsage(["기쁨", "기쁨", "슬픔", "없는감정"]);
  assert.equal(usage.length, EMOTIONS.length);
  assert.equal(usage.find(([emotion]) => emotion === "기쁨")[1], 2);
  assert.equal(usage.find(([emotion]) => emotion === "저항")[1], 0);
  assert.ok(usage.some(([, count]) => count === 0));
}
console.log("✓ 15개 감정 실제 사용 빈도·0회 보존");

// 가중 중심 — 감정 없는 곡은 표본에서 뺀다
{
  const c = emotionCenter(["기쁨", "기쁨", "슬픔"]);
  assert.equal(c.n, 3);
  assert.ok(c.v > 0, "기쁨 2 : 슬픔 1이면 중심은 밝은 쪽");
  assert.equal(emotionCenter(["", "", ""]), null, "감정이 하나도 없으면 중심 없음");
  const d = emotionCenter(["기쁨", "", "기쁨"]);
  assert.equal(d.n, 2, "빈 감정은 중심을 (0,0)으로 끌지 않는다");
  assert.equal(d.v, emotionPoint("기쁨").v);
}

// entropy — 집중 0, 고른 혼재 1
{
  assert.equal(emotionEntropy([["기쁨", 5]]), 0);
  assert.ok(Math.abs(emotionEntropy([["기쁨", 3], ["슬픔", 3]]) - 1) < 1e-9);
  assert.equal(diversityLabel([["기쁨", 5]]), "한 감정에 집중");
  assert.equal(diversityLabel([["기쁨", 3], ["슬픔", 2]]), "두세 감정이 교차");
  assert.equal(diversityLabel([["기쁨", 2], ["슬픔", 2], ["분노", 2], ["불안", 2], ["몽환", 2]]), "여러 감정이 혼재");
}
console.log("✓ entropy·다양성 라벨");

// 정서 유형 경계값
{
  const n = 5;
  assert.equal(moodType({ v: 2, a: 1, n }), "밝은 확장");
  assert.equal(moodType({ v: 2, a: -1, n }), "고요한 회복");
  assert.equal(moodType({ v: -2, a: 1, n }), "긴장된 저항");
  assert.equal(moodType({ v: -2, a: -1, n }), "깊은 침잠");
  // 중립 부근은 사분면에 억지로 넣지 않는다
  const T = MOOD_NEUTRAL_BAND;
  assert.equal(moodType({ v: T - 0.1, a: T - 0.1, n }), "몽환적 유예");
  assert.equal(moodType({ v: T - 0.1, a: T - 0.1, n }, { entropy: 0.8 }), "복합 정서");
  assert.equal(moodType({ v: 0.1, a: 2, n }), "흔들리는 탐색");
  // 표본이 적으면 단정하지 않는다
  assert.equal(moodType({ v: 3, a: 3, n: MOOD_MIN_SAMPLE - 1 }), "판단 유보");
  assert.equal(moodType(null), "판단 유보");
}
console.log("✓ 정서 유형 경계값");

// 달의 성격 — 기록이 주어이고 3곡 미만이면 라벨 자체가 없다
{
  const n = MOOD_MIN_SAMPLE;
  assert.equal(monthCharacterLabel({ v: 0, a: MONTH_CHARACTER_THRESHOLD, n }), "고조된 기록의 달");
  assert.equal(monthCharacterLabel({ v: 0, a: -MONTH_CHARACTER_THRESHOLD, n }), "조용한 기록의 달");
  assert.equal(monthCharacterLabel({ v: 2, a: 0, n }), "완만한 기록의 달");
  assert.equal(monthCharacterLabel({ v: 0, a: 3, n: MOOD_MIN_SAMPLE - 1 }), "");
  assert.equal(monthCharacterLabel(null), "");
}
console.log("✓ 달의 성격 — 각성 중심 계산·표본 부족 미표시");

// 이동 라벨 — 0.4 미만은 잡음
{
  assert.equal(moveLabel({ v: 0, a: 0 }, { v: 1, a: 0 }), "밝아지는 중");
  assert.equal(moveLabel({ v: 0, a: 0 }, { v: -1, a: 1 }), "어두워지는 중 · 각성도 상승");
  assert.equal(moveLabel({ v: 0, a: 0 }, { v: 0.2, a: -0.2 }), "이전 달과 비슷함");
  assert.equal(moveLabel(null, { v: 1, a: 0 }), "");
}

// 원형 각도 — 기쁨은 오른쪽 위 사분면, 슬픔은 왼쪽 아래
{
  const joy = emotionAngle("기쁨");
  const sad = emotionAngle("슬픔");
  assert.ok(joy > 0 && joy < Math.PI / 2);
  assert.ok(sad < -Math.PI / 2);

  // 좌표 방향이 같은 감정은 원 둘레에서 포개지므로 배치할 때만 벌린다
  assert.equal(emotionAngle("고독"), emotionAngle("그리움"), "둘 다 -135°");
  const spread = emotionAngles(["고독", "그리움", "기쁨"]);
  assert.notEqual(spread.get("고독"), spread.get("그리움"), "배치 각도는 갈라져야 한다");
  assert.ok(Math.abs(spread.get("기쁨") - emotionAngle("기쁨")) < 1e-3, "혼자면 원래 각도 그대로");
}
console.log("✓ 이동 라벨·원형 각도");
console.log("all passed");
