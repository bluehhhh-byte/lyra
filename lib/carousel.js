// 인스타그램 캐러셀 조립 — 고른 후크 한 줄과 연 하나로 4장을 만든다.
//
// 왜 4장인가: 캐러셀의 이점(단일 이미지 대비 도달 3배·저장 9배)은 "여러 장"이라는
// 사실에서 나오지 장수에서 나오지 않는다. 8장은 중간 이탈이 늘고, 이탈은 신호를 깎는다.
// 그리고 한 줄에 한 장씩 만드는 것은 만드는 사람에게도 낭비다.
//
// 왜 연 단위인가: 가사는 이미 연으로 나뉘어 저장돼 있고(빈 줄 구분), 923곡 5,964개 연을
// 재보니 연당 원문 중앙값이 4줄·79자다 — 카드 한 장에 원문과 번역이 함께 들어가는 크기다.
// 곡당 연이 중앙값 6개이므로 좋은 연 하나만 고르면 나머지는 자동으로 정해진다.
//
// 장 구성:
//   1  앨범 커버 크게 + 곡 해설 — 계정의 얼굴. 무엇에 대한 게시물인지 먼저 밝힌다
//   2  후크 한 줄만 크게, 번역 없이 — 넘긴 사람의 시선을 붙잡는다
//   3  후크가 속하지 않은 연 (보통 첫 연) — 상황을 연다
//   4  후크가 속한 연 — 2장에서 본 구절을 맥락 안에서 다시 만난다
//
// 4장이 2장을 되풀이하는 것이 설계의 핵심이다. 뜻 모르고 지나간 한 줄이 마지막
// 장에서 완성된다. 커버를 앞에 두는 이유: 피드 썸네일이 곧 1장이므로, 앨범 아트가
// 썸네일이 되면 계정 그리드 전체가 앨범 진열장처럼 읽힌다.

export const CAROUSEL_SLIDES = 4;

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

// 후크가 속하지 않은 연 중 가장 앞선 것 — 보통 첫 연이다.
function openingStanza(groups, hookStanza) {
  return groups.find((g) => g.stanza !== hookStanza && stanzaFits(g)) || null;
}

// 자동 선택 — 사람이 고를 것을 없앤다. 923곡을 매번 통독하며 후크를 찾게 두면
// 발행이 멈추고, 발행이 멈추는 것이 지금 도달 하락의 직접 원인이다.
// 고른 결과가 마음에 들지 않으면 화면에서 바꿀 수 있다 — 자동은 기본값이지 강제가 아니다.
export function autoPick(lines) {
  const picks = suggestHooks(lines, 1);
  if (picks.length) return picks[0].index;
  // 점수를 받은 줄이 하나도 없는 곡(전부 너무 길거나 짧다) — 첫 줄로 시작한다
  return lines.findIndex((l) => String(l?.en || "").trim());
}

// 4장 구성. hookIndex는 lines에서의 위치, note는 곡 코멘트.
// 반환값의 각 장은 drawCard가 그대로 받는 { lines } 형태다.
export function buildCarousel({ lines, hookIndex, note = "", openingStanzaIndex = null }) {
  const hook = lines[hookIndex];
  if (!hook) return { slides: [], error: "후크로 쓸 줄을 고르세요" };

  const groups = groupByStanza(lines);
  const hookGroup = groups.find((g) => g.items.some((i) => i.index === hookIndex));
  const opening =
    (openingStanzaIndex != null && groups.find((g) => g.stanza === openingStanzaIndex)) ||
    openingStanza(groups, hookGroup?.stanza);

  const slides = [
    // 1장 — 앨범 커버가 주인공이다. 뒤의 세 장은 커버를 흐려 배경으로 깔지만
    // 이 장만은 그대로 크게 싣는다(전용 렌더러 drawCoverCard). 피드 썸네일이
    // 곧 이 장이므로 계정 그리드가 앨범 진열장으로 읽힌다.
    { role: "cover", label: "커버·해설", note: note.trim(), lines: [] },
    // 2장 — 후크. 번역을 붙이지 않는다. 한 줄만 크게 그려져야 하고,
    // 뜻은 4장에서 맥락과 함께 열린다.
    { role: "hook", label: "후크", lines: [{ en: hook.en, ko: "" }] },
  ];

  if (opening) slides.push({ role: "opening", label: "여는 연", lines: opening.items.map(({ en, ko }) => ({ en, ko })) });
  if (hookGroup) slides.push({ role: "peak", label: "후크가 속한 연", lines: hookGroup.items.map(({ en, ko }) => ({ en, ko })) });

  return { slides: slides.slice(0, CAROUSEL_SLIDES), error: "" };
}

// 후크 후보를 점수 순으로 — 화면이 "이 줄이 좋다"고 먼저 제안하기 위한 것이다.
// 사람이 최종 결정하지만, 923곡을 매번 통독하게 두지는 않는다.
export function suggestHooks(lines, limit = 6) {
  return lines
    .map((line, index) => ({ index, line, score: hookScore(line) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit);
}
