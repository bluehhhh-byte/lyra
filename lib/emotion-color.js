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

// 캐러셀 배경 워시의 감정 틴트.
//
// 배경은 앨범아트를 16px로 줄여 흐린 것이라 그 곡의 우세색만 남는다. 그리드에서
// 보면 계열이 보이지 않는다 — 사이트 통계는 이미 감정→hue 체계를 쓰는데
// 게시물은 그걸 안 쓴다. 얇게 한 겹 덮어 감정의 계열이 묶여 보이게 한다.
//
// oklch가 아니라 hsl 문자열을 조립하는 이유: emotionColor는 oklch를 돌려주는데
// 캔버스 fillStyle의 oklch 지원이 브라우저마다 갈린다. 지원하지 않으면 색이
// 통째로 무시돼 틴트가 조용히 사라진다. hsl은 어디서나 먹는다.
export const WASH_TINT_ALPHA = 0.15;
export const WASH_TINT_SATURATION = 30;
export const WASH_TINT_LIGHTNESS = 18;

export function emotionToWash(emotion) {
  const hue = EMOTION_HUES[emotion];
  // 사전에 없는 감정(또는 빈 값)은 지금 워시 그대로 — 억지로 색을 만들지 않는다
  if (hue === undefined) return { base: "#181410", tint: "", alpha: 0 };
  const color = `hsl(${hue}, ${WASH_TINT_SATURATION}%, ${WASH_TINT_LIGHTNESS}%)`;
  return {
    // 아트를 못 불러왔을 때의 바탕. 예전에는 검정 사각형이라 "고장"처럼 보였다.
    base: color,
    tint: color,
    alpha: WASH_TINT_ALPHA,
  };
}
