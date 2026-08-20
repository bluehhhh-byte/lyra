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

// 후크로 쓸 만한 줄인가 — 짧고, 1인칭이고, 서사가 아닌 발화.
// 고유명사·연도가 든 줄은 아름다워도 스크롤을 멈추지 못한다.
export function hookScore(line) {
  const t = String(line?.en || "").trim();
  if (!t) return 0;
  const len = [...t].length;
  if (len < 4 || len > 24) return 0; // 0.5초에 읽히는 길이를 벗어난다

  let score = 10;
  if (len <= 14) score += 6; // 짧을수록 크게 그릴 수 있다
  if (/(^|[\s])(나|내|난|내가|우리|널|너를|네|당신)([\s]|$|[은는이가를도만의])/.test(t)) score += 8; // 1인칭·2인칭 발화
  if (/(어|아|줘|봐|해|자|까|네|나|다)$/.test(t)) score += 3; // 종결어미로 끝나는 발화
  if (/\d{4}/.test(t)) score -= 8; // 연도 = 서사
  if (/[A-Za-z]{4,}/.test(t) && !/[가-힣]/.test(t)) score -= 4; // 영어 전용 줄은 후순위
  return Math.max(0, score);
}

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
// 9줄이면 3/3/3, 10줄이면 4/3/3, 7줄이면 3/2/2. 줄이 조각 수보다 적으면
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

// 기본 선택 — 누른 연에서 시작해 아홉 줄. 세 장에 세 줄씩이 가장 읽기 좋은 밀도다.
// 연 경계를 넘어 이어 담는다: 가사는 연속된 이야기이고, 아홉 줄이 연 하나보다 길다.
export function autoSelect(lines, startIndex = 0, want = 9) {
  const picked = [];
  for (let i = Math.max(0, startIndex); i < lines.length && picked.length < want; i++)
    if (String(lines[i]?.en || "").trim()) picked.push(i);
  // 시작점이 뒤쪽이라 아홉 줄이 안 되면 앞에서 채운다
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
      lines: chunk.map(({ en, ko }) => ({ en, ko })),
    })),
  ];
  return { slides: slides.slice(0, CAROUSEL_SLIDES), error: "" };
}

// 캡션 첫 줄에 인용할 구절 — 고른 가사 중 가장 후크다운 줄.
// 카드를 누르지 않아도 피드에서 읽히게 하는 용도다.
export function autoPick(lines) {
  const picks = suggestHooks(lines, 1);
  if (picks.length) return picks[0].index;
  return lines.findIndex((l) => String(l?.en || "").trim());
}

// 후크 후보를 점수 순으로// 후크 후보를 점수 순으로 — 화면이 "이 줄이 좋다"고 먼저 제안하기 위한 것이다.
// 사람이 최종 결정하지만, 923곡을 매번 통독하게 두지는 않는다.
export function suggestHooks(lines, limit = 6) {
  return lines
    .map((line, index) => ({ index, line, score: hookScore(line) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit);
}
