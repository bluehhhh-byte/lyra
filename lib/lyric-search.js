// 가사 검색 판정 — 순수 함수. 데이터 로더(search-index.js)와 분리해 둔 것은
// next/cache 없이 node만으로 테스트하기 위해서다.
//
// 응답 상한이 있는 이유: "다"처럼 흔한 글자는 전곡의 절반이 맞는다. 상한 없이
// 다 보내면 전곡 인덱스를 내려받던 예전과 다를 게 없다.
// 원문 가사에는 전각 공백(U+3000)과 NBSP가 483곳 섞여 있다. 원문은 고치지
// 않는 것이 원칙이라 데이터로는 손댈 수 없고, 손대지 않으면 보통 공백으로 친
// 검색어가 그 줄을 영영 못 찾는다 — "말 하는"으로는 "말　하는"이 안 걸린다.
// 그래서 저장된 글자는 그대로 두고 비교할 때만 공백을 하나로 접는다.
// ponytail: 줄마다 매번 접는다. 곡 950개 기준 한 번의 검색에 수만 줄이지만
// 짧은 문자열의 정규식 치환이라 체감되지 않는다 — 느려지면 색인에 정규화본을
// 함께 담는 쪽으로 옮기면 된다.
// JS의 \s는 U+3000·NBSP·U+FEFF를 모두 포함한다 — 따로 나열할 필요가 없다.
const SPACES = /\s+/g;
export const normalizeSearchText = (value) => String(value || "").replace(SPACES, " ").trim().toLowerCase();

export const LYRIC_QUERY_MIN = 2;
export const LYRIC_QUERY_MAX = 40;
export const LYRIC_HITS_MAX = 200;

export function searchableLyricLines(song, { translations = true } = {}) {
  return song.stanzas
    .flatMap((stanza) => stanza.lines.flatMap((line) => translations ? [line.en, line.ko] : [line.en]))
    .map((line) => String(line || "").trim())
    .filter(Boolean);
}

export function lyricMatches(songs, rawQuery) {
  const q = normalizeSearchText(rawQuery).slice(0, LYRIC_QUERY_MAX);
  if (q.length < LYRIC_QUERY_MIN) return { q, hits: [] };
  const hits = [];
  for (const s of songs) {
    // 보여주는 것은 저장된 원문 그대로고, 맞춰보는 것만 정규화한 사본이다
    const line = s.lines.find((l) => normalizeSearchText(l).includes(q));
    if (!line) continue;
    hits.push({ slug: s.slug, line });
    if (hits.length === LYRIC_HITS_MAX) break;
  }
  return { q, hits };
}
