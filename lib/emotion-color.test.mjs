import assert from "node:assert/strict";
import { emotionColor, emotionHue } from "./emotion-color.js";

const point = (dominant, v = 0, a = 0) => ({ dominant, center: { v, a } });

// 감정 이름이 색의 의미를 정한다.
assert.notEqual(emotionHue("사랑"), emotionHue("슬픔"));
assert.notEqual(emotionHue("기쁨"), emotionHue("고독"));
assert.notEqual(emotionColor(point("사랑")), emotionColor(point("슬픔")));

// 같은 감정도 실제 밝기와 각성이 다르면 당시 감성에 맞게 색이 달라진다.
assert.notEqual(emotionColor(point("몽환", -1, -1)), emotionColor(point("몽환", 1, -1)));
assert.notEqual(emotionColor(point("몽환", 0, -2)), emotionColor(point("몽환", 0, 2)));
assert.match(emotionColor(point("알 수 없음", 1, 1)), /^oklch\(/);

console.log("✓ 월별 감정 의미색 · 밝기 명도 · 각성 채도");
