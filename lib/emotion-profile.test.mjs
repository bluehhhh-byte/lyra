import assert from "node:assert/strict";
import { EMOTION_PROFILE_AXES, emotionProfile, emotionProfileScores } from "./emotion-profile.js";

assert.deepEqual(EMOTION_PROFILE_AXES.map((axis) => axis.label), [
  "밝은 기운", "강한 에너지", "감정의 폭", "어두운 깊이", "잔잔한 여운",
]);

const brightEnergetic = emotionProfileScores({ center: { v: 3, a: 3 }, entropy: 0.75 });
assert.deepEqual(brightEnergetic, [1, 1, 0.75, 0, 0]);

const darkQuiet = emotionProfileScores({ center: { v: -3, a: -3 }, entropy: 0.2 });
assert.deepEqual(darkQuiet, [0, 0, 0.2, 1, 1]);

const neutral = emotionProfileScores({ center: { v: 0, a: 0 }, entropy: 0.5 });
assert.deepEqual(neutral, [0.5, 0.5, 0.5, 0.5, 0.5]);
assert.ok(emotionProfile({ center: { v: -3, a: -3 }, entropy: 0 }).every((value) => value >= 0.18));

console.log("✓ 직관적 감성 5축 · 고정 0~100 척도");
