// 두 캐러셀이 공유하는 카드 가구 — 서명.
//
// 가사 카드(Lyra.)와 영화 카드(Cyno.)는 워드마크가 다르지만 계정은 하나다.
// 각자 그리게 두면 한쪽만 고치게 되고, 실제로 그런 일이 있었다: 서명에 핸들을
// 붙이면서 표지의 태그 줄은 워드마크 폭만 비워 둬서 #태그가 핸들 위로 올라탔다.
// 재는 쪽과 그리는 쪽을 한 함수로 묶어 두면 그 어긋남이 생기지 않는다.

import { CAROUSEL_THEME } from "./carousel.js";

const SANS = CAROUSEL_THEME.sans;
const SERIF = CAROUSEL_THEME.serif;
const PAD = CAROUSEL_THEME.padding;

// 워드마크는 이름이지 주소가 아니다 — 계정을 찾으려면 핸들이 필요하다.
export const INSTAGRAM_HANDLE = "@lyra.cyno";

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

