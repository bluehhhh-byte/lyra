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
export const MAX_SELECTED_LINES = 21;
export const CAROUSEL_THEME = Object.freeze({
  width: 1080,
  height: 1350,
  padding: 84,
  sans: '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", sans-serif',
  serif: 'Georgia, "Noto Serif KR", serif',
});
export const LYRIC_CAROUSEL_FONT_FACES = [
  '700 52px "Pretendard Variable"',
  '500 36px "Pretendard Variable"',
  // 커버 머리글. 캔버스는 로드되지 않은 굵기를 조용히 대체 서체로 그린다 —
  // 목록에 없으면 이 한 줄만 다른 글꼴로 찍힌다.
  '800 72px "Pretendard Variable"',
];

export async function waitForCarouselFonts(fonts = globalThis.document?.fonts, faces = LYRIC_CAROUSEL_FONT_FACES) {
  if (!fonts) return false;
  await fonts.ready;
  if (typeof fonts.load === "function") await Promise.all(faces.map((face) => fonts.load(face)));
  return true;
}

const CAROUSEL_NOTE_FONT_SIZES = [42, 40, 38, 36, 34, 32, 30, 28, 26, 24];

// 실제로 그릴 수 있는 높이를 기준으로 설명의 글자 크기와 행간을 함께 고른다.
// wrapAtSize는 캔버스의 실제 폰트 측정값을 사용하므로 한글·일본어·영문 폭 차이도 반영된다.
export function fitCarouselNoteLayout({ maxHeight, wrapAtSize }) {
  let layout = { fontSize: 24, lineHeight: 38, lines: [], height: 0, fits: true };
  for (const fontSize of CAROUSEL_NOTE_FONT_SIZES) {
    const lineGap = fontSize >= 32 ? 22 : Math.max(14, Math.round(fontSize * 0.55));
    const lineHeight = fontSize + lineGap;
    const lines = wrapAtSize(fontSize);
    const height = lines.length * lineHeight;
    layout = { fontSize, lineHeight, lines, height, fits: height <= maxHeight };
    if (layout.fits) break;
  }
  return layout;
}

export function carouselDownloadEntries(blobs, carouselId) {
  if (!Array.isArray(blobs) || blobs.length !== CAROUSEL_SLIDES)
    throw new Error(`캐러셀은 ${CAROUSEL_SLIDES}장이 모두 준비되어야 저장할 수 있습니다.`);
  const safeId = String(carouselId || "carousel")
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9가-힣_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "carousel";
  return blobs.map((blob, index) => ({
    blob,
    name: `cyno-${safeId}-${String(index + 1).padStart(2, "0")}.png`,
  }));
}

export function carouselSizeReport(blobs = []) {
  const perCard = Array.from(blobs, (blob) => Number(blob?.size) || 0);
  const total = perCard.reduce((sum, size) => sum + size, 0);
  return {
    perCard,
    total,
    average: perCard.length ? Math.round(total / perCard.length) : 0,
    largest: Math.max(0, ...perCard),
  };
}

export function formatCarouselBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  return value >= 1024 * 1024
    ? `${(value / (1024 * 1024)).toFixed(2)} MB`
    : `${Math.round(value / 1024)} KB`;
}

// 고른 줄을 n조각으로 고르게 나눈다 — 순서는 그대로, 앞 조각이 크거나 같게.
// 21줄이면 7/7/7, 10줄이면 4/3/3, 7줄이면 3/2/2. 줄이 조각 수보다 적으면
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

// 기본 선택 — 누른 연에서 시작해 최대 스물한 줄. 세 장에 일곱 줄씩 담되,
// 각 카드 렌더러가 번역과 줄바꿈을 계산해 글자 크기를 안전하게 맞춘다.
export function autoSelect(lines, startIndex = 0, want = MAX_SELECTED_LINES) {
  const picked = [];
  for (let i = Math.max(0, startIndex); i < lines.length && picked.length < want; i++)
    if (String(lines[i]?.en || "").trim()) picked.push(i);
  // 시작점이 뒤쪽이라 스물한 줄이 안 되면 앞에서 채운다
  for (let i = Math.max(0, startIndex) - 1; i >= 0 && picked.length < want; i--)
    if (String(lines[i]?.en || "").trim()) picked.unshift(i);
  return picked;
}

// 5장 구성. selected는 고른 줄들(순서대로), note는 곡 코멘트,
// appearance는 검증된 영화·드라마·애니메이션 수록 정보다.
// 마지막 가사 장 아래에 들어가는 것들. 여기까지 넘긴 사람이 가장 뜨거운
// 독자인데 그냥 끝나고 있었다 — 저장할 이유도, 프로필로 갈 길도 없이.
export const CAROUSEL_CTA_PRIMARY = "전체 번역과 해설은 프로필 링크";
export const CAROUSEL_CTA_SECONDARY = "이 가사가 좋았다면 저장해 두세요";
export const CAROUSEL_TRUNCATED_NOTE = "… 이하 생략 — 전문은 프로필 링크";
// 본문이 밀어내지 못하게 미리 빼 두는 높이. 구분선 + 두 줄 + 숨 쉴 여백.
export const CAROUSEL_FOOTER_HEIGHT = 120;
// 생략 표시는 푸터 위에 한 줄 더 붙는다.
export const CAROUSEL_TRUNCATED_HEIGHT = 46;

// 마지막 장이 예약해야 하는 높이. 본문 레이아웃이 이만큼을 빼고 계산한다 —
// 다 그린 뒤에 얹으면 21줄 만선 곡에서 푸터가 카드 밖으로 나간다.
export function carouselFooterReserve({ isLast = false, truncated = false } = {}) {
  if (!isLast) return 0;
  return CAROUSEL_FOOTER_HEIGHT + (truncated ? CAROUSEL_TRUNCATED_HEIGHT : 0);
}

// 본문이 쓸 수 있는 상자. 머리 여백 250 + 꼬리 110 + 서명·진행점 몫이 360이고,
// 마지막 장은 거기서 푸터 예약분을 더 뺀다.
export const CAROUSEL_BODY_TOP = 250;
export function carouselBodyBox({ isLast = false, truncated = false } = {}) {
  const height = CAROUSEL_THEME.height - 360 - carouselFooterReserve({ isLast, truncated });
  return { top: CAROUSEL_BODY_TOP, height, bottom: CAROUSEL_BODY_TOP + height };
}

// 푸터 각 줄의 기준선. 예약한 높이와 실제로 그리는 자리가 두 파일에 따로
// 적혀 있어서, 생략 표시가 예약 띠를 벗어나 본문 마지막 줄에 붙어 버렸다
// (2026-09-12 실측: 본문 1050행 끝, 표시 1051행 시작). 한 곳에서 계산한다.
export function carouselFooterLayout() {
  const ctaY = CAROUSEL_THEME.height - 110 - CAROUSEL_FOOTER_HEIGHT + 34;
  return {
    dividerY: ctaY - 34,
    ctaY,
    ctaSubY: ctaY + 38,
    // 생략 표시는 여분 띠 안, 구분선 바로 위 — 본문 바닥을 침범하지 않는 자리다
    noteY: ctaY - CAROUSEL_TRUNCATED_HEIGHT,
  };
}

export function buildCarousel({ selected, note = "", appearance = "", totalLines = 0 }) {
  const chunks = splitLines(selected);
  if (!chunks.length) return { slides: [], error: "실을 가사를 골라 주세요" };
  // 21줄 상한에 걸려 남은 가사가 있으면 마지막 장이 그 사실을 밝힌다. 밝히지
  // 않으면 발췌가 완곡으로 읽힌다.
  const truncated = totalLines > 0 && selected.length < totalLines;

  const slides = [
    // 1장 — 앨범 커버가 주인공. 전용 렌더러(drawCoverCard)가 흐림 없이 크게 싣는다.
    { role: "cover", label: "커버", lines: [] },
    // 2장 — 곡 설명. 전용 렌더러(drawAboutCard)가 해설 문장을 그린다.
    { role: "about", label: "곡 설명", note: note.trim(), appearance: appearance.trim(), lines: [] },
    // 3~5장 — 가사. 기존 drawCard가 그대로 그린다.
    ...chunks.map((chunk, i) => ({
      role: "lyrics",
      label: `가사 ${i + 1}/${chunks.length}`,
      part: i + 1,
      parts: chunks.length,
      // 잘려서 실제로 마지막이 되는 장에만 붙어야 한다 — slice 전에 판정하면
      // 6장짜리 곡에서 보이지 않는 장에 푸터가 붙는다.
      isLast: false,
      truncated: false,
      lines: chunk.map(({ en, ko }) => ({ en, ko })),
    })),
  ];
  const visible = slides.slice(0, CAROUSEL_SLIDES);
  const last = visible.at(-1);
  if (last?.role === "lyrics") {
    last.isLast = true;
    last.truncated = truncated;
  }
  return { slides: visible, error: "" };
}
