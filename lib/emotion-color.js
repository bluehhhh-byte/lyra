// 정서 지도의 월 색상. 대표 감정이 색상(hue)의 의미를 정하고, 월의 실제 밝기와
// 각성이 각각 명도와 채도를 조절한다. 같은 감정이라도 그 달의 좌표가 다르면 색도
// 미세하게 달라져, 색이 단순 범례가 아니라 당시 감성의 요약으로 기능한다.
const EMOTION_HUES = {
  사랑: 18,
  설렘: 342,
  그리움: 252,
  이별: 310,
  슬픔: 235,
  고독: 275,
  위로: 175,
  희망: 138,
  기쁨: 78,
  분노: 28,
  저항: 42,
  불안: 105,
  체념: 220,
  회상: 62,
  몽환: 295,
};

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function emotionColor(point) {
  const valence = clamp(Number(point?.center?.v) || 0, -3, 3);
  const arousal = clamp(Number(point?.center?.a) || 0, -3, 3);
  const fallbackHue = 250 - ((valence + 3) / 6) * 210;
  const hue = EMOTION_HUES[point?.dominant] ?? fallbackHue;
  const lightness = 0.68 + valence * 0.024;
  const chroma = 0.115 + ((arousal + 3) / 6) * 0.065;
  return `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} ${hue.toFixed(0)})`;
}

export const emotionHue = (emotion) => EMOTION_HUES[emotion];
