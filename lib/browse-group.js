// 홈 컬렉션의 그룹 나누기 — browse.js(화면)와 테스트가 같은 함수를 쓴다.
//
// 그룹 수는 필터된 전체 기준이어야 한다. 렌더 캡이 걸린 부분집합을 그룹화하면
// "이바디 (3)"처럼 실제(11곡)와 다른 수가 헤더에 붙는다 — 수를 보여줄 거면
// 진짜 수여야 한다. 렌더 캡은 그룹 나누기와 무관한 표시 문제다.
export function groupSongs(list, group) {
  if (group === "none" || group === "random") return [["", list]];
  const map = new Map();
  for (const s of list) {
    const k = s[group] || "기타";
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(s);
  }
  // decade: 최신 연대 먼저; 그 외: 큰 그룹 먼저
  const entries = [...map.entries()];
  entries.sort((a, b) => (group === "decade" ? b[0].localeCompare(a[0]) : b[1].length - a[1].length));
  return entries;
}
