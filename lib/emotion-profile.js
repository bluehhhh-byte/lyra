// 별 그래프의 다섯 축은 기술 지표가 아니라, 기록에 붙은 감정 태그를 사람이 바로
// 읽을 수 있는 감성 언어로 풀어낸다. 모든 달에 같은 0..1 기준을 적용해 월간 비교가
// 가능하며, 그래프가 너무 작아 사라지지 않도록 그릴 때만 18%의 안쪽 반경을 둔다.
export const EMOTION_PROFILE_AXES = [
  { key: "bright", label: "밝은 기운", short: "밝음", description: "기쁨·희망·사랑처럼 밝은 쪽으로 기운 정도" },
  { key: "energy", label: "강한 에너지", short: "에너지", description: "분노·저항·설렘처럼 감정이 고조된 정도" },
  { key: "breadth", label: "감정의 폭", short: "감정 폭", description: "여러 감정이 한쪽에 치우치지 않고 섞인 정도" },
  { key: "dark", label: "어두운 깊이", short: "어둠", description: "슬픔·이별·고독처럼 어두운 쪽으로 기운 정도" },
  { key: "quiet", label: "잔잔한 여운", short: "여운", description: "위로·회상·몽환처럼 차분하게 머무는 정도" },
];

const clamp01 = (value) => Math.max(0, Math.min(1, value));

export function emotionProfileScores(point) {
  const valence = Math.max(-3, Math.min(3, Number(point?.center?.v) || 0));
  const arousal = Math.max(-3, Math.min(3, Number(point?.center?.a) || 0));
  const bright = clamp01((valence + 3) / 6);
  const energy = clamp01((arousal + 3) / 6);
  return [bright, energy, clamp01(Number(point?.entropy) || 0), 1 - bright, 1 - energy];
}

export function emotionProfile(point, radiusFloor = 0.18) {
  return emotionProfileScores(point).map((score) => radiusFloor + (1 - radiusFloor) * score);
}
