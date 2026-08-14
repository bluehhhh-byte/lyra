// 음악의 감정과 영화 장르를 억지로 맞추지 않는다. 두 기록이 실제로 공유할 수 있는
// 서사 주제만 작은 닫힌 어휘로 둔다. 큐레이션 영화는 사람이 1~3개를 검수해 저장한다.
export const CULTURAL_THEMES = [
  "상실",
  "고독",
  "불안",
  "사랑",
  "성장",
  "가족",
  "기억",
  "위로",
  "해방",
  "희망",
];

const THEME_SET = new Set(CULTURAL_THEMES);

export function parseThemes(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(values.map((item) => item.trim()).filter((item) => THEME_SET.has(item)))].slice(0, 3);
}

export function themeCounts(movies) {
  const counts = new Map();
  for (const movie of movies) for (const theme of parseThemes(movie.themes)) counts.set(theme, (counts.get(theme) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
