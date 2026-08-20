// 가사 검색 판정 — 순수 함수. 데이터 로더(search-index.js)와 분리해 둔 것은
// next/cache 없이 node만으로 테스트하기 위해서다.
//
// 응답 상한이 있는 이유: "다"처럼 흔한 글자는 전곡의 절반이 맞는다. 상한 없이
// 다 보내면 전곡 인덱스를 내려받던 예전과 다를 게 없다.
export const LYRIC_QUERY_MIN = 2;
export const LYRIC_QUERY_MAX = 40;
export const LYRIC_HITS_MAX = 200;

export function lyricMatches(songs, rawQuery) {
  const q = String(rawQuery || "").trim().toLowerCase().slice(0, LYRIC_QUERY_MAX);
  if (q.length < LYRIC_QUERY_MIN) return { q, hits: [] };
  const hits = [];
  for (const s of songs) {
    const line = s.lines.find((l) => l.toLowerCase().includes(q));
    if (!line) continue;
    hits.push({ slug: s.slug, line });
    if (hits.length === LYRIC_HITS_MAX) break;
  }
  return { q, hits };
}
