"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { wrap, wrapTight } from "../../../lib/carousel-wrap";
import { cleanListenWhen, retimeListenWhen } from "../../../lib/listen-when";
import { emotionToWash } from "../../../lib/emotion-color";
import { createPortal } from "react-dom";
import { buildCaption } from "../../../lib/caption";
import InstagramCaptionPreview from "../../caption-preview";
import {
  buildCarousel,
  autoSelect,
  CAROUSEL_THEME,
  CAROUSEL_SLIDES,
  MAX_SELECTED_LINES,
  fitCarouselNoteLayout,
  waitForCarouselFonts,
  carouselBodyBox,
} from "../../../lib/carousel";
import { drawSignature, measureSignature } from "../../../lib/carousel-chrome";
import { carouselArtworkSrc } from "../../../lib/artwork-source";
import {
  carouselArtistLine,
  carouselDisplayTitle,
  carouselTitleParts,
  layoutBilingualCarouselTitle,
  TRANSLATED_TITLE_POINT_OFFSET,
} from "../../../lib/carousel-title";

// Stanza → 1080×1350 share card (flat dominant-color background from the album
// art, ink flips black/white to match). CardModal builds an Instagram carousel:
// 커버 → 곡 설명 → 가사 3장. 고를 것은 실을 가사뿐이고, 몇 장에 어떻게 나눌지는
// lib/carousel.js가 정한다. 다 그리면 인스타 업로드 순서대로 번호를 붙여
// 공유 시트에 넘긴다(안 되면 순서대로 내려받기). All client-side, no deps.

const W = CAROUSEL_THEME.width;
const H = CAROUSEL_THEME.height;
const MAX_PAIRS = MAX_SELECTED_LINES;
const SANS = CAROUSEL_THEME.sans;
const SERIF = CAROUSEL_THEME.serif;
const INK = "#f6f1e4";
const INK_DIM = "rgba(246,241,228,0.84)";
const PAD = CAROUSEL_THEME.padding;
// 1장과 2장이 같은 상자로 사진을 자른다. 상자가 다르면 drawImageCover의
// 잘라내기 기준이 달라져, 카드를 넘길 때 사진이 확대·이동한 것처럼 보인다.
const COVER_ART_HEIGHT = 1000;

export function drawImageCover(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const sw = width / scale;
  const sh = height / scale;
  ctx.drawImage(
    image,
    (image.width - sw) / 2,
    (image.height - sh) / 2,
    sw,
    sh,
    x,
    y,
    width,
    height,
  );
}

export function drawRoundedArt(ctx, image, x, y, size, radius = 18) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, size, size, radius);
  ctx.clip();
  drawImageCover(ctx, image, x, y, size, size);
  ctx.restore();
}

export function drawArtWash(ctx, art, scrim = 0.66, emotion = "") {
  // 아트가 없으면 이 바탕이 그대로 보인다. 감정색을 쓰면 "검정 사각형"이
  // 아니라 그 곡의 계열로 읽힌다.
  const wash = emotionToWash(emotion);
  ctx.fillStyle = wash.base;
  ctx.fillRect(0, 0, W, H);
  if (art) {
    const tiny = document.createElement("canvas");
    tiny.width = tiny.height = 16;
    tiny.getContext("2d").drawImage(art, 0, 0, 16, 16);
    const size = Math.max(W, H) * 1.4;
    ctx.imageSmoothingEnabled = true;
    ctx.filter = "blur(40px)";
    ctx.drawImage(tiny, (W - size) / 2, (H - size) / 2, size, size);
    ctx.filter = "none";
  }
  ctx.fillStyle = `rgba(0,0,0,${scrim})`;
  ctx.fillRect(0, 0, W, H);
  // scrim 위에 얇게 한 겹. 잉크 대비를 해치지 않는 선(0.15)에서 계열만 드러낸다.
  if (wash.tint) {
    ctx.save();
    ctx.globalAlpha = wash.alpha;
    ctx.fillStyle = wash.tint;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

export function drawPageNumber(ctx, position, total) {
  ctx.save();
  ctx.fillStyle = "rgba(24,20,16,0.58)";
  ctx.beginPath();
  ctx.rect(W - PAD - 132, 66, 132, 58, 29);
  ctx.fill();
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(246,241,228,0.88)";
  ctx.font = `600 25px ${SANS}`;
  ctx.fillText(`${String(position).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, W - PAD - 20, 104);
  ctx.restore();
}

export function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let fitted = text;
  while (fitted.length && ctx.measureText(`${fitted}…`).width > maxWidth) fitted = fitted.slice(0, -1);
  return `${fitted}…`;
}

export function fitFontSize(ctx, text, maxWidth, sizes, font) {
  for (const size of sizes) {
    ctx.font = font(size);
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  return sizes.at(-1);
}

export function drawBilingualTitleLine(ctx, {
  line,
  translatedTitle,
  x,
  y,
  baseSize,
  font,
  translatedPointOffset = TRANSLATED_TITLE_POINT_OFFSET,
}) {
  const translated = String(translatedTitle || "").trim().replace(/^\((.*)\)$/, "$1").trim();
  const suffix = translated ? `(${translated})` : "";
  if (!suffix || !line.endsWith(suffix)) {
    ctx.font = font(baseSize);
    ctx.fillText(line, x, y);
    return;
  }

  const original = line.slice(0, -suffix.length).trimEnd();
  ctx.font = font(baseSize);
  if (original) ctx.fillText(original, x, y);
  const offset = original ? ctx.measureText(`${original} `).width : 0;
  // 표지는 번역을 작게, 곡 설명은 원문과 같은 크기로 쓸 수 있게 카드별 간격을 받는다.
  const translatedSize = Math.max(10, baseSize - (translatedPointOffset * 96) / 72);
  ctx.font = font(translatedSize);
  ctx.fillText(suffix, x + offset, y);
}

// 표지 서명 크기. 자리를 재는 쪽과 그리는 쪽이 같은 값을 봐야 겹치지 않는다.
const SIGNATURE_MARK_SIZE = 30;


export const SWIPE_CUE = "→ 넘겨서 가사 보기";

// 표지에만. 인스타그램은 캐러셀에 점 표시를 달아 주지만 첫 장에서 "넘기면
// 뭐가 나오는지"는 말해 주지 않는다 — 가사가 나온다는 걸 알면 넘길 이유가 생긴다.
// 표지는 페이지 칩도 진행점도 안 그리므로 우상단이 통째로 비어 있다. 앨범아트
// 중앙을 가리지 않으면서 가장 먼저 눈에 걸리는 자리다.
export function drawSwipeCue(ctx, { x = W - PAD, y = 104 } = {}) {
  ctx.save();
  ctx.font = `600 25px ${SANS}`;
  const textW = ctx.measureText(SWIPE_CUE).width;
  const padX = 22;
  const boxW = textW + padX * 2;
  ctx.fillStyle = "rgba(24,20,16,0.58)";
  ctx.beginPath();
  ctx.rect(x - boxW, y - 40, boxW, 58, 29);
  ctx.fill();
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(246,241,228,0.88)";
  ctx.fillText(SWIPE_CUE, x - padX, y);
  ctx.restore();
}

export function drawProgress(ctx, position, total) {
  const gap = 18;
  const dot = 7;
  const start = (W - ((total - 1) * gap + dot * 2)) / 2;
  for (let i = 0; i < total; i++) {
    ctx.beginPath();
    ctx.arc(start + i * gap, H - 66, i + 1 === position ? dot : 4, 0, Math.PI * 2);
    ctx.fillStyle = i + 1 === position ? INK : "rgba(246,241,228,0.35)";
    ctx.fill();
  }
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // required, or the canvas taints and toBlob throws
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export { wrap, wrapTight };

async function drawCard({ song, lines, art, align = "left", position, total }) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  drawArtWash(ctx, art, 0.66, song.emotion);

  if (art) drawRoundedArt(ctx, art, PAD, 68, 124);
  else {
    ctx.fillStyle = "#26262b";
    ctx.fillRect(PAD, 68, 124, 124);
  }
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = `700 36px ${SANS}`;
  ctx.fillText(fitText(ctx, song.title, 560), 232, 115);
  ctx.fillStyle = INK_DIM;
  ctx.font = `500 27px ${SANS}`;
  ctx.fillText(song.artist, 232, 157);
  drawPageNumber(ctx, position, total);

  // lyric lines — original (serif, bright) over translation (sans, dimmed).
  // Size steps down with the pair count, then a shrink-to-fit loop handles
  // what the tiers can't (wrapped lines, dense pairs).
  //
  // 줄 간격은 글자 크기에 비례한다. 예전에는 크기와 무관하게 +14였는데, 그러면
  // 글자를 줄여도 간격은 그대로라 축소가 먹히지 않는다. 조판으로도 틀린 값이고,
  // 축소 루프가 제자리걸음하는 원인이기도 했다. 큰 글자에서는 거의 같은 값이라
  // (42px → 55 vs 56) 보통 카드의 모습은 그대로다.
  const LEADING = 1.32;
  const pairs = lines.slice(0, MAX_PAIRS);
  const tiers = [[3, 54, 38], [4, 48, 34], [5, 42, 30]];
  let [, oSize, tSize] = tiers.find(([n]) => pairs.length <= n) || tiers.at(-1);
  const maxW = W - PAD * 2;
  const build = () => {
    const blocks = [];
    for (const l of pairs) {
      const serif = (s) => `600 ${s}px ${SERIF}`;
      ctx.font = serif(oSize);
      const orig = wrapTight(ctx, l.en, maxW, { font: serif, size: oSize });
      for (const t of orig.lines)
        blocks.push({ t, size: orig.size, gap: Math.round(orig.size * LEADING), dim: false });
      if (l.ko) {
        const sans = (s) => `500 ${s}px ${SANS}`;
        ctx.font = sans(tSize);
        const trans = wrapTight(ctx, l.ko, maxW, { font: sans, size: tSize });
        for (const t of trans.lines)
          blocks.push({ t, size: trans.size, gap: Math.round(trans.size * LEADING), dim: true });
      }
      blocks.push({ t: "", size: 0, gap: Math.round(oSize * 0.55) });
    }
    return blocks;
  };
  let blocks = build();
  // 푸터 높이를 본문 예산에서 먼저 뺀다. 다 그린 뒤에 얹으면 24줄 만선 곡에서
  // 푸터가 카드 밖으로 밀려난다.
  const { top, height: budget } = carouselBodyBox();
  let totalH = blocks.reduce((acc, b) => acc + b.gap, 0);
  // 비율만으로는 수렴이 느려 매번 최소 1px은 반드시 줄이고, 바닥에 닿을 만큼
  // 횟수를 준다. 바닥값은 한 장에 여덟 쌍(24줄 ÷ 3장)이 전부 두 줄로 접힌 최악의
  // 경우가 예산에 들어가는 크기다.
  for (let guard = 24; totalH > budget && guard > 0; guard--) {
    const f = budget / totalH;
    const nextO = Math.round(oSize * f);
    const nextT = Math.round(tSize * f);
    oSize = Math.max(26, nextO < oSize ? nextO : oSize - 1);
    tSize = Math.max(20, nextT < tSize ? nextT : tSize - 1);
    blocks = build();
    totalH = blocks.reduce((acc, b) => acc + b.gap, 0);
  }
  let y = top + Math.max(0, (budget - totalH) / 2); // centered in the free space
  ctx.textAlign = align;
  const xText = align === "right" ? W - PAD : align === "center" ? W / 2 : PAD;
  for (const b of blocks) {
    y += b.gap;
    if (!b.t) continue;
    ctx.font = b.dim
      ? `500 ${b.size}px ${SANS}`
      : `600 ${b.size}px ${SERIF}`;
    ctx.fillStyle = b.dim ? INK_DIM : INK;
    ctx.fillText(b.t, xText, y);
  }

  drawSignature(ctx, { x: PAD, y: H - 56 });
  drawProgress(ctx, position, total);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

// 1장 전용 — 앨범 커버가 주인공인 카드. 뒤의 장들은 커버를 흐려 배경으로 깔지만
// 이 장은 그대로 크게 싣는다. 피드 썸네일이 곧 이 장이라 계정 그리드가 앨범
// 진열장으로 읽힌다. 해설은 2장(drawAboutCard)이 맡는다.
async function drawCoverCard({ song, art }) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#181410";
  ctx.fillRect(0, 0, W, H);

  // 텍스트 블록에 충분한 숨 쉴 공간을 남기면서 커버의 존재감은 유지한다.
  if (art) {
    drawImageCover(ctx, art, 0, 0, W, COVER_ART_HEIGHT);
  } else {
    ctx.fillStyle = "#1a1a1e";
    ctx.fillRect(0, 0, W, COVER_ART_HEIGHT);
  }

  // 커버 아래쪽에서 본문 영역으로 부드럽게 넘어가게 — 경계선이 딱 떨어지면 잘라 붙인 티가 난다.
  // 머리글을 아트 위에 얹는 카드는 그 글이 앉을 만큼 어둠막을 길게 끌어올린다.
  // 「…다짐하는 밤」을 아침에 발행하면 보는 사람의 시간과 어긋난다. 그리는
  // 순간의 시간대로 끝 낱말만 바꾼다 — 저장된 값은 그대로다(lib/listen-when.js).
  const hook = retimeListenWhen(cleanListenWhen(song.listen_when));
  const scrimHeight = hook ? 360 : 120;
  const fade = ctx.createLinearGradient(0, COVER_ART_HEIGHT - scrimHeight, 0, COVER_ART_HEIGHT);
  fade.addColorStop(0, "rgba(24,20,16,0)");
  if (hook) fade.addColorStop(0.5, "rgba(24,20,16,0.72)");
  fade.addColorStop(1, "rgba(24,20,16,1)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, COVER_ART_HEIGHT - scrimHeight, W, scrimHeight);
  ctx.fillStyle = "#181410";
  ctx.fillRect(0, COVER_ART_HEIGHT, W, H - COVER_ART_HEIGHT);

  const ink = INK;
  const inkDim = INK_DIM;
  const pad = 96;

  // 1장의 머리글 — 이 곡을 언제 들으면 좋은지. 제목보다 먼저 읽히라고 아트 안에
  // 크게 앉힌다. 카드 아래 텍스트 구역은 곡 정보(제목·아티스트·태그)의 자리다.
  if (hook) {
    const barW = 8;
    const barGap = 26;
    const headlineMax = W - pad * 2 - barW - barGap;
    const headlineFont = (size) => `800 ${size}px ${SANS}`;
    // 두 줄 안에 들어가는 가장 큰 크기를 고른다. 세 줄이 되면 머리글이 아니라
    // 문단이 된다 — 마지막 크기까지 안 되면 거기서 접는다. wrapTight는 "…싶은 /
    // 밤"처럼 한두 글자만 넘친 줄을 조금 줄여 한 줄로 당긴다.
    let headlineSize = 42;
    let headlineLines = [];
    for (const size of [72, 66, 60, 54, 48, 42]) {
      ctx.font = headlineFont(size);
      const tight = wrapTight(ctx, hook, headlineMax, { font: headlineFont, size, minRatio: 0.86 });
      headlineSize = tight.size;
      headlineLines = tight.lines;
      if (headlineLines.length <= 2) break;
    }
    const lineHeight = Math.round(headlineSize * 1.32);
    const lastBaseline = COVER_ART_HEIGHT - 52;
    const firstBaseline = lastBaseline - (headlineLines.length - 1) * lineHeight;

    ctx.strokeStyle = "#c8b6ff"; // globals.css의 --color-accent
    ctx.lineWidth = barW;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pad + barW / 2, firstBaseline - headlineSize * 0.78);
    ctx.lineTo(pad + barW / 2, lastBaseline + headlineSize * 0.14);
    ctx.stroke();

    // 밝은 앨범 아트 위에서도 흰 글자가 뭉개지지 않게 한 겹 그림자를 깐다
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = ink;
    ctx.font = headlineFont(headlineSize);
    headlineLines.forEach((line, index) => {
      ctx.fillText(line, pad + barW + barGap, firstBaseline + index * lineHeight);
    });
    ctx.restore();
  }
  // 제목은 `원문 (한글 번역)`으로 묶고, 긴 feat. 크레딧은 제목이 아니라
  // 아티스트 정보에 붙인다. 데이터의 `아티스트 - 제목` 중복도 함께 제거한다.
  ctx.textAlign = "left";
  ctx.fillStyle = ink;
  const titleMaxWidth = W - pad * 2;
  const titleParts = carouselTitleParts(song.title, song.artist);
  const artistLine = carouselArtistLine(song.artist, titleParts.qualifier, song.artist_ko);
  const titleLayout = layoutBilingualCarouselTitle(
    titleParts.main,
    song.title_ko,
    (line, size) => {
      ctx.font = `600 ${size}px ${SERIF}`;
      return ctx.measureText(line).width;
    },
    titleMaxWidth,
    2,
  );
  const titleTop = COVER_ART_HEIGHT + 24;
  ctx.font = `600 ${titleLayout.fontSize}px ${SERIF}`;
  titleLayout.lines.forEach((line, index) => {
    drawBilingualTitleLine(ctx, {
      line,
      translatedTitle: song.title_ko,
      x: pad,
      y: titleTop + titleLayout.fontSize + index * titleLayout.lineHeight,
      baseSize: titleLayout.fontSize,
      font: (size) => `600 ${size}px ${SERIF}`,
    });
  });

  // 아래 세 줄(아티스트·국가/장르/연도·해시태그)은 피드에서 크게 축소돼 보인다.
  // 작으면 아예 안 읽히므로 제목 다음으로 큰 활자를 준다. 태그 줄은 카드 맨 아래에
  // 고정이라, 그 글자 윗단을 기준선이 내려갈 수 있는 바닥으로 삼는다 — 크기를
  // 키울 때마다 H - 82 같은 상수를 손으로 다시 맞추지 않아도 된다.
  const TAG_SIZE = 29;
  const TAG_BASELINE = H - 52;
  const detailFloor = TAG_BASELINE - TAG_SIZE - 6;

  const meta = [song.country, song.genre, song.year].filter(Boolean).join(" · ");
  let detailY = titleTop + titleLayout.fontSize + (titleLayout.lines.length - 1) * titleLayout.lineHeight + 58;
  const artistSize = fitFontSize(
    ctx,
    artistLine,
    titleMaxWidth,
    [36, 34, 32, 30, 28, 26, 24],
    (size) => `500 ${size}px ${SANS}`,
  );
  if (detailY <= detailFloor) {
    ctx.fillStyle = inkDim;
    ctx.font = `500 ${artistSize}px ${SANS}`;
    ctx.fillText(fitText(ctx, artistLine, titleMaxWidth), pad, detailY);
    detailY += artistSize + 16;
    if (meta && detailY <= detailFloor) {
      ctx.fillStyle = "rgba(246,241,228,0.52)";
      ctx.font = `500 28px ${SANS}`;
      ctx.fillText(fitText(ctx, meta, titleMaxWidth), pad, detailY);
    }
  }

  // 하단 — 이 곡의 키워드와 감정. 사이트가 이미 가진 어휘를 그대로 쓴다
  // (keywords는 곡의 소재, emotion은 감정 한 낱말). 워드마크 폭만큼은 비워 둔다.
  ctx.font = `500 ${TAG_SIZE}px ${SANS}`;
  const room = W - pad * 2 - measureSignature(ctx, { markSize: SIGNATURE_MARK_SIZE }).total - 32;
  const words = [...(song.keywords || []), song.emotion].filter(Boolean);
  let tagLine = "";
  for (const w of words) {
    const next = tagLine ? `${tagLine} #${w}` : `#${w}`;
    if (ctx.measureText(next).width > room) break; // 넘치면 거기서 끊는다 — 줄바꿈 없이 한 줄
    tagLine = next;
  }
  if (tagLine) {
    ctx.fillStyle = "rgba(246,241,228,0.6)";
    ctx.fillText(tagLine, pad, TAG_BASELINE);
  }
  drawSignature(ctx, { x: W - pad, y: TAG_BASELINE, align: "right", markSize: SIGNATURE_MARK_SIZE });
  // 표지는 좌우 여백이 pad(96)다 — 기본 PAD(84)로 그리면 큐만 12px 밖으로 나간다
  drawSwipeCue(ctx, { x: W - pad });

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

// 2장 전용 — 곡 설명 카드. 해설은 923곡 전부에 있는 자산이자 다른 가사 계정이
// 갖지 못한 차별점이라 제 장을 준다. 배경은 가사 카드와 같은 문법(흐린 커버 + 어두운
// 막)이라 묶음이 한 벌로 읽히고, 글은 해설 하나뿐이라 천천히 읽힌다.
async function drawAboutCard({ song, note, appearance, art, position, total }) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#181410";
  ctx.fillRect(0, 0, W, H);
  // 1장과 똑같은 상자에 그린다. 보이는 높이는 검은 막이 정한다 — 사진이 그대로
  // 있고 아래에서 막이 올라온 것처럼 넘어가야 한다.
  const artHeight = 570;
  if (art) drawImageCover(ctx, art, 0, 0, W, COVER_ART_HEIGHT);
  else {
    ctx.fillStyle = "#242428";
    ctx.fillRect(0, 0, W, artHeight);
  }
  const fade = ctx.createLinearGradient(0, 330, 0, 690);
  fade.addColorStop(0, "rgba(24,20,16,0)");
  fade.addColorStop(0.68, "rgba(24,20,16,0.92)");
  fade.addColorStop(1, "#181410");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 330, W, 360);
  // 막이 끝나는 자리부터는 사진이 아니라 지면이다
  ctx.fillStyle = "#181410";
  ctx.fillRect(0, 690, W, H - 690);

  drawPageNumber(ctx, position, total);
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(246,241,228,0.72)";
  ctx.font = `700 24px ${SANS}`;
  ctx.fillText("SONG NOTE", PAD, 630);

  const maxW = W - PAD * 2;
  const text = note || `${song.artist}의 ${song.year || ""}년 곡.`.replace("의 년", "의");
  const noteTop = 680;
  const noteBottom = appearance ? 920 : H - 230;
  const noteLayout = fitCarouselNoteLayout({
    maxHeight: noteBottom - noteTop,
    wrapAtSize: (fontSize) => {
      ctx.font = `500 ${fontSize}px ${SANS}`;
      return wrap(ctx, text, maxW);
    },
  });
  let y = noteTop;
  ctx.fillStyle = INK;
  ctx.font = `500 ${noteLayout.fontSize}px ${SANS}`;
  for (const line of noteLayout.lines) {
    y += noteLayout.lineHeight;
    ctx.fillText(line, PAD, y);
  }

  if (appearance) {
    // SONG NOTE의 원래 위치는 유지하고, 수록 정보만 본문의 우측 하단 캡션으로 둔다.
    const appearanceY = 990;
    // 글자를 키우면 한 줄에 들어가는 글자가 줄고, 두 줄을 넘긴 나머지는 조용히
    // 잘린다(slice(0, 2)). 아래는 비어 있으므로 폭을 같이 넓혀 같은 문장이
    // 여전히 두 줄에 들어가게 한다.
    const appearanceMaxW = Math.floor(maxW * 0.78);
    ctx.strokeStyle = "rgba(246,241,228,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W - PAD - 260, appearanceY - 34);
    ctx.lineTo(W - PAD, appearanceY - 34);
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(192,167,255,0.92)";
    ctx.font = `700 20px ${SANS}`;
    ctx.fillText("수록 정보", W - PAD, appearanceY);
    ctx.fillStyle = INK_DIM;
    ctx.font = `500 26px ${SANS}`;
    wrap(ctx, appearance, appearanceMaxW).slice(0, 2).forEach((line, index) => {
      ctx.fillText(line, W - PAD, appearanceY + 40 + index * 36);
    });
    ctx.textAlign = "left";
  }

  // 설명 카드도 같은 표기 규칙을 쓴다: `원문 (한글 번역)` / `아티스트 (Feat. …)`.
  const titleParts = carouselTitleParts(song.title, song.artist);
  const displayTitle = carouselDisplayTitle(song.title, song.title_ko, song.artist);
  const artistLine = carouselArtistLine(song.artist, titleParts.qualifier, song.artist_ko);
  const displaySize = fitFontSize(
    ctx,
    displayTitle,
    maxW,
    [31, 29, 27, 25, 23],
    (size) => `700 ${size}px ${SANS}`,
  );
  ctx.fillStyle = INK;
  ctx.font = `700 ${displaySize}px ${SANS}`;
  drawBilingualTitleLine(ctx, {
    line: fitText(ctx, displayTitle, maxW),
    translatedTitle: song.title_ko,
    x: PAD,
    y: H - 145,
    baseSize: displaySize,
    font: (size) => `700 ${size}px ${SANS}`,
    translatedPointOffset: 0,
  });
  const artistSize = fitFontSize(
    ctx,
    artistLine,
    maxW,
    [23, 21, 19, 17],
    (size) => `500 ${size}px ${SANS}`,
  );
  ctx.fillStyle = INK_DIM;
  ctx.font = `500 ${artistSize}px ${SANS}`;
  ctx.fillText(fitText(ctx, artistLine, maxW), PAD, H - 106);
  drawSignature(ctx, { x: PAD, y: H - 56 });
  drawProgress(ctx, position, total);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

// 캐러셀은 여러 장을 한 번에 넘겨야 한다. 공유 시트는 파일 여러 개를 한 번에 받지만
// 지원이 고르지 않아, 인스타 업로드 순서가 보이는 파일명으로 내려받는 쪽을 기본으로 둔다.
async function downloadAll(blobs, song) {
  const files = blobs.map((b, i) => new File([b], `lyra-${song.slug}-${String(i + 1).padStart(2, "0")}.png`, { type: "image/png" }));
  if (navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files, title: `${song.title} — ${song.artist}` });
      return;
    } catch {} // 시트를 닫았거나 여러 파일을 못 받는다 — 내려받기로 넘어간다
  }
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
    await new Promise((r) => setTimeout(r, 250)); // 연속 다운로드를 브라우저가 막지 않게
  }
}

// `lines` is every line of the song (flattened; section set on stanza-opening
// lines), so the picker can mix lines from anywhere. `initial` seeds the
// selection with the stanza that was clicked.
export default function CardModal({ song, lines: allLines, initial, onClose }) {
  const [align, setAlign] = useState("left");
  // 실을 줄 — 누른 연에서 시작해 열다섯 줄이 기본이다(세 장 × 다섯 줄).
  // 체크박스로 자유롭게 바꾼다. 나누는 것은 기계가 한다.
  const [sel, setSel] = useState(() => new Set(autoSelect(allLines, initial?.[0] ?? 0)));
  const [cards, setCards] = useState([]); // [{ role, label, url }]
  const [activeCard, setActiveCard] = useState(0);
  const cardBlobs = useRef([]);
  const [building, setBuilding] = useState(false);

  const selectedLines = useMemo(
    () => allLines.map((l, i) => ({ ...l, i })).filter((l) => sel.has(l.i)),
    [allLines, sel]
  );
  const carousel = useMemo(
    () => buildCarousel({
      selected: selectedLines,
      note: song.comment || "",
      appearance: song.appearance || "",
    }),
    [selectedLines, song.comment, song.appearance]
  );

  // 다섯 장을 한꺼번에 그린다. 가사 장은 전부 같은 drawCard를 지나므로
  // 줄 배치·글자 크기 규칙이 장마다 어긋날 일이 없다.
  useEffect(() => {
    if (!carousel.slides.length) return;
    let alive = true;
    setBuilding(true);
    (async () => {
      const [, art] = await Promise.all([
        waitForCarouselFonts(),
        loadImage(carouselArtworkSrc(song.artwork)).catch(() => null),
      ]);
      const made = [];
      for (const [index, slide] of carousel.slides.entries()) {
        const page = { position: index + 1, total: carousel.slides.length };
        const blob =
          slide.role === "cover"
            ? await drawCoverCard({ song, art })
            : slide.role === "about"
              ? await drawAboutCard({ song, note: slide.note, appearance: slide.appearance, art, ...page })
              : await drawCard({ song, lines: slide.lines, art, align, ...page });
        if (!alive) return;
        if (blob) made.push({ ...slide, blob, url: URL.createObjectURL(blob) });
      }
      if (!alive) {
        made.forEach((m) => URL.revokeObjectURL(m.url));
        return;
      }
      setCards((old) => {
        old.forEach((o) => URL.revokeObjectURL(o.url));
        return made;
      });
      cardBlobs.current = made.map((m) => m.blob);
      setActiveCard((current) => Math.min(current, Math.max(0, made.length - 1)));
      setBuilding(false);
    })();
    return () => {
      alive = false;
    };
  }, [carousel, song, align]);

  useEffect(() => () => cards.forEach((c) => URL.revokeObjectURL(c.url)), [cards]);

  const toggle = (i) =>
    setSel((old) => {
      const next = new Set(old);
      if (next.has(i)) next.delete(i);
      else if (next.size < MAX_SELECTED_LINES) next.add(i);
      return next;
    });

  // body에 포탈로 그린다 — 안 그러면 곡 페이지 히어로(제목 블록이 명시적
  // z-10)의 그릴 순서를 이 모달을 감싸는 조상(.relative.isolate인 가사 뷰)이
  // 가로챈다. isolate는 새 스태킹 컨텍스트를 만들어 모달의 z-40을 그 안에
  // 가둬버리고, 바깥에서는 조상 자체가 z-index:auto로 취급된다. CSS 규칙상
  // auto는 명시적 양수 z-index보다 항상 아래라, 히어로 텍스트가 모달(특히
  // "곡 설명" 슬라이드 이미지) 위에 겹쳐 그려졌다. body 포탈은 그 조상
  // 스태킹 컨텍스트 자체를 벗어나므로 z-40이 그대로 최상위에서 적용된다.
  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-2 opacity-100 transition-opacity duration-200 ease-out sm:p-4 starting:opacity-0 motion-reduce:transition-none"
      role="dialog"
      aria-modal="true"
      aria-label="캐러셀 만들기"
    >
      {/* modal: transform-origin stays centered (not trigger-anchored) by design */}
      <div
        onClick={(e) => e.stopPropagation()}
        role="document"
        className="flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-full min-w-0 max-w-[calc(100vw-1rem)] scale-100 flex-col overflow-hidden  border border-line bg-bg p-3 opacity-100 transition duration-200 ease-out-strong sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-5xl sm:p-6 starting:scale-[0.97] starting:opacity-0 motion-reduce:transition-none"
      >
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3 sm:mb-4 sm:gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">인스타그램 캐러셀 {CAROUSEL_SLIDES}장</p>
            <p className="mt-0.5 text-xs text-muted">커버 · 곡 설명 · 가사 3장</p>
          </div>
          <button onClick={onClose} aria-label="캐러셀 닫기" className=" border border-line px-3 py-1.5 text-xs text-muted hover:text-accent">닫기</button>
        </div>

        <div className="grid min-h-0 min-w-0 flex-1 gap-4 overflow-y-auto overscroll-contain pr-1 sm:gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
          <section aria-label="카드 미리보기" className="min-w-0">
            {carousel.error ? (
              <p className=" border border-line px-3 py-12 text-center text-sm text-muted">{carousel.error}</p>
            ) : cards.length ? (
              <>
                <img
                  src={cards[activeCard]?.url}
                  alt={`${activeCard + 1}번째 카드 — ${cards[activeCard]?.label}`}
                  draggable={false}
                  className="mx-auto max-h-[42dvh] w-auto max-w-full select-none  border border-line shadow-2xl sm:max-h-[56dvh] lg:max-h-[62vh]"
                />
                <ol className="mt-2 grid min-w-0 grid-cols-5 gap-1.5 sm:mt-3 sm:gap-2">
                  {cards.map((card, index) => (
                    <li key={`${card.role}-${index}`} className="min-w-0">
                      <button
                        type="button"
                        onClick={() => setActiveCard(index)}
                        aria-label={`${index + 1}번째 카드 보기 — ${card.label}`}
                        aria-pressed={activeCard === index}
                        className={`w-full min-w-0  border p-1 transition ${activeCard === index ? "border-accent bg-accent/10" : "border-line opacity-65 hover:opacity-100"}`}
                      >
                        <img src={card.url} alt="" draggable={false} className="aspect-[4/5] w-full  object-cover" />
                        <span className="mt-1 block truncate text-[10px] text-muted">{index + 1}. {card.label}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <div className="flex h-[42dvh] max-h-[420px] items-center justify-center  border border-line text-sm text-muted sm:h-auto sm:aspect-[4/5] sm:max-h-[56dvh] lg:max-h-[62vh]">카드 생성 중…</div>
            )}
          </section>

          <section aria-label="가사와 내보내기 설정" className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-ink">
                가사 {sel.size}/{MAX_SELECTED_LINES}줄
                <span className="ml-2 text-xs font-normal text-muted">장당 약 {Math.ceil(sel.size / 3)}줄</span>
              </p>
              <div className="flex gap-1">
                {[["left", "좌", "왼쪽"], ["center", "중", "가운데"], ["right", "우", "오른쪽"]].map(([k, label, name]) => (
                  <button
                    key={k}
                    onClick={() => setAlign(k)}
                    aria-label={`${name} 정렬`}
                    aria-pressed={align === k}
                    className={` border px-2.5 py-0.5 text-xs transition ${
                      align === k
                        ? "border-accent bg-accent font-semibold text-bg"
                        : "border-line text-muted hover:text-accent"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          <p className="mb-2 text-xs leading-relaxed text-muted">가사 3장에 나누어 최대 24줄까지 선택할 수 있습니다.</p>
          <ul className="max-h-72 space-y-1 overflow-y-auto overscroll-contain  border border-line p-2 lg:max-h-[44vh]">
          {allLines.map((l, i) => (
            <li key={i}>
              {l.section && (
                <p className="mb-0.5 mt-2 text-[10px] font-semibold uppercase tracking-widest text-accent/70">
                  {l.section}
                </p>
              )}
              <label className="flex cursor-pointer items-baseline gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={sel.has(i)}
                  onChange={() => toggle(i)}
                  disabled={!sel.has(i) && sel.size >= MAX_SELECTED_LINES}
                  className="translate-y-0.5 accent-(--color-accent)"
                />
                <span className={`truncate ${sel.has(i) ? "" : "text-muted"}`}>
                  {l.en}
                </span>
              </label>
            </li>
          ))}
          </ul>

          <div className="mt-4 flex gap-2">
          <button
            onClick={() => cardBlobs.current.length && downloadAll(cardBlobs.current, song)}
            disabled={building || !cards.length}
            className="flex-1  ink-action px-4 py-2 text-sm font-semibold text-bg transition active:scale-[0.98] disabled:opacity-40"
          >
            {building ? "만드는 중…" : `${cards.length}장 저장`}
          </button>
          </div>

          <Caption song={song} />
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Instagram post caption — 이미지와 함께 붙여넣을 텍스트. 복사 시점의 시각으로
// 타임스탬프를 다시 만든다.
function Caption({ song }) {
  const make = () => buildCaption(song, new Date());
  const [text, setText] = useState(make);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const fresh = make(); // 복사하는 순간의 년월일시로 갱신
    setText(fresh);
    try {
      await navigator.clipboard.writeText(fresh);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {} // clipboard 차단 환경 — 아래 텍스트를 직접 복사하면 됨
  };

  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-muted">인스타그램 캡션</span>
        <button onClick={copy} className="text-xs text-accent hover:underline">
          {copied ? "복사됨 ✓" : "복사"}
        </button>
      </div>
      <InstagramCaptionPreview text={text} />
    </div>
  );
}
