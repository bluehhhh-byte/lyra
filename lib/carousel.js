// 인스타그램 캐러셀 조립 — 고른 가사를 다섯 장으로 만든다.
//
// 왜 캐러셀인가: 단일 이미지 대비 도달 3배·저장 9배(2026 측정). 스와이프가 곧
// watch time이고, 릴스 없이 그 신호를 얻는 유일한 방법이다.
//
// 장 구성 (5장):
//   1  앨범 커버 크게 — 피드 썸네일이 곧 이 장이라, 계정 그리드가 앨범 진열장으로 읽힌다
//   2  곡 설명 — 923곡 전부에 있는 해설. 다른 가사 계정이 갖지 못한 자산이라 제 장을 준다
//   3~5  고른 가사를 세 장에 고르게 나눠 싣는다 (원문 + 번역)
//
// 가사를 사람이 고르고 기계가 나눈다. 어느 구절이 좋은지는 사람이 알고,
// 세 장에 몇 줄씩 담을지는 계산 문제다 — 각자 잘하는 쪽이 맡는다.

export const CAROUSEL_SLIDES = 5;
export const LYRIC_PARTS = 3;
export const MAX_SELECTED_LINES = 15;

// 연 목록으로 나눈다 — lines는 평평한 배열이고 각 줄에 stanza 인덱스가 실려 있다.
export function groupByStanza(lines) {
  const out = [];
  lines.forEach((line, index) => {
    const key = line.stanza ?? 0;
    let g = out.find((x) => x.stanza === key);
    if (!g) out.push((g = { stanza: key, section: "", items: [] }));
    if (line.section) g.section = line.section;
    g.items.push({ ...line, index });
  });
  return out;
}

// 카드 한 장에 들어갈 만한 연인가. 4줄 이하가 전체의 66%다 —
// 넘으면 글자가 작아져 피드에서 안 읽힌다.
export const stanzaFits = (group, max = 5) => group.items.length > 0 && group.items.length <= max;

// 고른 줄을 n조각으로 고르게 나눈다 — 순서는 그대로, 앞 조각이 크거나 같게.
// 15줄이면 5/5/5, 10줄이면 4/3/3, 7줄이면 3/2/2. 줄이 조각 수보다 적으면
// 빈 카드를 만들지 않고 조각 수를 줄인다.
export function splitLines(lines, parts = LYRIC_PARTS) {
  const items = lines.filter((l) => String(l?.en || "").trim());
  const n = Math.min(parts, items.length);
  if (!n) return [];
  const out = [];
  let start = 0;
  for (let i = 0; i < n; i++) {
    const size = Math.ceil((items.length - start) / (n - i));
    out.push(items.slice(start, start + size));
    start += size;
  }
  return out;
}

// 기본 선택 — 누른 연에서 시작해 최대 열다섯 줄. 세 장에 다섯 줄씩 담되,
// 각 카드 렌더러가 번역과 줄바꿈을 계산해 글자 크기를 안전하게 맞춘다.
export function autoSelect(lines, startIndex = 0, want = MAX_SELECTED_LINES) {
  const picked = [];
  for (let i = Math.max(0, startIndex); i < lines.length && picked.length < want; i++)
    if (String(lines[i]?.en || "").trim()) picked.push(i);
  // 시작점이 뒤쪽이라 열다섯 줄이 안 되면 앞에서 채운다
  for (let i = Math.max(0, startIndex) - 1; i >= 0 && picked.length < want; i--)
    if (String(lines[i]?.en || "").trim()) picked.unshift(i);
  return picked;
}

// 5장 구성. selected는 고른 줄들(순서대로), note는 곡 코멘트.
export function buildCarousel({ selected, note = "" }) {
  const chunks = splitLines(selected);
  if (!chunks.length) return { slides: [], error: "실을 가사를 골라 주세요" };

  const slides = [
    // 1장 — 앨범 커버가 주인공. 전용 렌더러(drawCoverCard)가 흐림 없이 크게 싣는다.
    { role: "cover", label: "커버", lines: [] },
    // 2장 — 곡 설명. 전용 렌더러(drawAboutCard)가 해설 문장을 그린다.
    { role: "about", label: "곡 설명", note: note.trim(), lines: [] },
    // 3~5장 — 가사. 기존 drawCard가 그대로 그린다.
    ...chunks.map((chunk, i) => ({
      role: "lyrics",
      label: `가사 ${i + 1}/${chunks.length}`,
      part: i + 1,
      parts: chunks.length,
      lines: chunk.map(({ en, ko }) => ({ en, ko })),
    })),
  ];
  return { slides: slides.slice(0, CAROUSEL_SLIDES), error: "" };
}
