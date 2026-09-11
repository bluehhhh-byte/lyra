// 두 캐러셀이 공유하는 카드 가구 — 서명과 마지막 장 푸터.
//
// 가사 카드(Lyra.)와 영화 카드(Cyno.)는 워드마크가 다르지만 계정은 하나다.
// 각자 그리게 두면 한쪽만 고치게 되고, 실제로 그런 일이 있었다: 서명에 핸들을
// 붙이면서 표지의 태그 줄은 워드마크 폭만 비워 둬서 #태그가 핸들 위로 올라탔다.
// 재는 쪽과 그리는 쪽을 한 함수로 묶어 두면 그 어긋남이 생기지 않는다.

import {
  CAROUSEL_THEME,
  CAROUSEL_TRUNCATED_HEIGHT,
  carouselFooterLayout,
} from "./carousel.js";

const SANS = CAROUSEL_THEME.sans;
const SERIF = CAROUSEL_THEME.serif;
const PAD = CAROUSEL_THEME.padding;
const INK = "#f6f1e4";

// 워드마크는 이름이지 주소가 아니다 — 계정을 찾으려면 핸들이 필요하다.
export const INSTAGRAM_HANDLE = "@lyra.cyno";

// 생략 표시의 글자 크기. 예약한 띠 안에 들어가야 본문 마지막 줄에 붙지 않는다.
export const TRUNCATED_NOTE_SIZE = 24;
if (TRUNCATED_NOTE_SIZE > CAROUSEL_TRUNCATED_HEIGHT)
  throw new Error("생략 표시가 예약한 띠보다 크다");

// 서명이 실제로 차지하는 폭. 표지의 태그 줄이 이만큼을 비워 둬야 한다 —
// 워드마크만 재면 핸들 폭(30px 기준 약 100px)만큼 글자가 서명 위로 올라탄다.
export function measureSignature(ctx, { mark = "Lyra.", markSize = 27 } = {}) {
  const gap = Math.round(markSize * 0.4);
  ctx.save();
  ctx.font = `600 ${markSize}px ${SERIF}`;
  const markW = ctx.measureText(mark).width;
  ctx.font = `500 ${Math.round(markSize * 0.68)}px ${SANS}`;
  const handleW = ctx.measureText(INSTAGRAM_HANDLE).width;
  ctx.restore();
  return { markW, handleW, gap, total: markW + gap + handleW };
}

// 워드마크 + 핸들을 한 덩어리로 그린다. 요소를 새로 늘리지 않고 이미 있던
// 서명에 주소를 붙이는 쪽이, 본문을 침범하지 않으면서 출처를 남기는 길이다.
export function drawSignature(ctx, { x, y, align = "left", mark = "Lyra.", markSize = 27 } = {}) {
  const { markW, gap, total } = measureSignature(ctx, { mark, markSize });
  ctx.save();
  ctx.textAlign = "left";
  const left = align === "right" ? x - total : x;
  ctx.fillStyle = "rgba(246,241,228,0.7)";
  ctx.font = `600 ${markSize}px ${SERIF}`;
  ctx.fillText(mark, left, y);
  // 핸들은 워드마크보다 한 단 옅게 — 서명이지 제목이 아니다
  ctx.fillStyle = "rgba(246,241,228,0.52)";
  ctx.font = `500 ${Math.round(markSize * 0.68)}px ${SANS}`;
  ctx.fillText(INSTAGRAM_HANDLE, left + markW + gap, y);
  ctx.restore();
}

// 마지막 장의 푸터. 다섯 장을 다 넘긴 사람에게만 보인다 — 그 사람이 저장하거나
// 프로필로 갈 확률이 가장 높은데, 지금까지 아무 말도 걸지 않았다.
// y 좌표는 carouselFooterLayout 한 곳에서 나오고, 본문은 그만큼을
// carouselBodyBox로 미리 비워 둔다. 여기서 본문을 밀어낼 일은 없다.
export function drawLastSlideFooter(ctx, { primary, secondary, note = "", align = "left" } = {}) {
  const W = CAROUSEL_THEME.width;
  const x = align === "right" ? W - PAD : align === "center" ? W / 2 : PAD;
  const { dividerY, ctaY, ctaSubY, noteY } = carouselFooterLayout();
  ctx.save();
  ctx.textAlign = align;

  if (note) {
    // 발췌라는 사실을 푸터보다 먼저 밝힌다 — 완곡으로 읽히면 안 된다
    ctx.fillStyle = "rgba(246,241,228,0.6)";
    ctx.font = `italic 500 ${TRUNCATED_NOTE_SIZE}px ${SANS}`;
    ctx.fillText(note, x, noteY);
  }

  // 구분선 — 본문과 권유를 가른다. 전체 폭이 아니라 짧게 그어 잘라 붙인 티를 없앤다.
  ctx.strokeStyle = "rgba(246,241,228,0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  const lineStart = align === "right" ? x - 120 : align === "center" ? x - 60 : x;
  ctx.moveTo(lineStart, dividerY);
  ctx.lineTo(lineStart + 120, dividerY);
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.font = `600 30px ${SANS}`;
  ctx.fillText(primary, x, ctaY);
  ctx.fillStyle = "rgba(246,241,228,0.62)";
  ctx.font = `500 24px ${SANS}`;
  ctx.fillText(secondary, x, ctaSubY);
  ctx.restore();
}
