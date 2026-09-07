"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { wrap, wrapTight } from "../../../lib/carousel-wrap";
import { cleanListenWhen } from "../../../lib/listen-when";
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
} from "../../../lib/carousel";
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

export function drawArtWash(ctx, art, scrim = 0.66) {
  ctx.fillStyle = "#181410";
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

  drawArtWash(ctx, art);

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
  // what the tiers can't (wrapped lines, dense pairs) — the fixed +14 line
  // paddings don't scale linearly with the font, so one pass can land short.
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
        blocks.push({ t, size: orig.size, gap: orig.size + 14, dim: false });
      if (l.ko) {
        const sans = (s) => `500 ${s}px ${SANS}`;
        ctx.font = sans(tSize);
        const trans = wrapTight(ctx, l.ko, maxW, { font: sans, size: tSize });
        for (const t of trans.lines)
          blocks.push({ t, size: trans.size, gap: trans.size + 14, dim: true });
      }
      blocks.push({ t: "", size: 0, gap: Math.round(oSize * 0.55) });
    }
    return blocks;
  };
  let blocks = build();
  const top = 250;
  const budget = H - 360;
  let totalH = blocks.reduce((acc, b) => acc + b.gap, 0);
  for (let guard = 6; totalH > budget && guard > 0; guard--) {
    const f = budget / totalH;
    oSize = Math.max(30, Math.round(oSize * f));
    tSize = Math.max(24, Math.round(tSize * f));
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

  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(246,241,228,0.7)";
  ctx.font = `600 27px ${SERIF}`;
  ctx.fillText("Lyra.", PAD, H - 56);
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
  const coverArtHeight = 1000;
  if (art) {
    drawImageCover(ctx, art, 0, 0, W, coverArtHeight);
  } else {
    ctx.fillStyle = "#1a1a1e";
    ctx.fillRect(0, 0, W, coverArtHeight);
  }

  // 커버 아래쪽에서 본문 영역으로 부드럽게 넘어가게 — 경계선이 딱 떨어지면 잘라 붙인 티가 난다
  const fade = ctx.createLinearGradient(0, coverArtHeight - 120, 0, coverArtHeight);
  fade.addColorStop(0, "rgba(24,20,16,0)");
  fade.addColorStop(1, "rgba(24,20,16,1)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, coverArtHeight - 120, W, 120);
  ctx.fillStyle = "#181410";
  ctx.fillRect(0, coverArtHeight, W, H - coverArtHeight);

  const ink = INK;
  const inkDim = INK_DIM;
  const pad = 96;
  // 제목은 `원문 (한글 번역)`으로 묶고, 긴 feat. 크레딧은 제목이 아니라
  // 아티스트 정보에 붙인다. 데이터의 `아티스트 - 제목` 중복도 함께 제거한다.
  ctx.textAlign = "left";
  ctx.fillStyle = ink;
  const titleMaxWidth = W - pad * 2;
  const titleParts = carouselTitleParts(song.title, song.artist);
  const artistLine = carouselArtistLine(song.artist, titleParts.qualifier);
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
  const titleTop = coverArtHeight + 24;
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

  const meta = [song.country, song.genre, song.year].filter(Boolean).join(" · ");
  let detailY = titleTop + titleLayout.fontSize + (titleLayout.lines.length - 1) * titleLayout.lineHeight + 54;
  const artistSize = fitFontSize(
    ctx,
    artistLine,
    titleMaxWidth,
    [29, 27, 25, 23, 21, 19, 17],
    (size) => `500 ${size}px ${SANS}`,
  );
  if (detailY <= H - 82) {
    ctx.fillStyle = inkDim;
    ctx.font = `500 ${artistSize}px ${SANS}`;
    ctx.fillText(fitText(ctx, artistLine, titleMaxWidth), pad, detailY);
    detailY += artistSize + 14;
    if (meta && detailY <= H - 88) {
      ctx.fillStyle = "rgba(246,241,228,0.4)";
      ctx.font = `500 23px ${SANS}`;
      ctx.fillText(fitText(ctx, meta, titleMaxWidth), pad, detailY);
    }
  }

  // "이런 순간에" 장면 한 줄 — 메타와 해시태그 사이의 빈 띠에 싣는다. 곡을
  // 걸어 둘 갈고리라서 메타(0.4)보다 밝게, 본문 잉크보다는 낮게 놓는다.
  // 제목이 길어 메타가 이 높이까지 내려온 카드에서는 겹치느니 뺀다.
  const hook = cleanListenWhen(song.listen_when);
  if (hook && detailY <= H - 168) {
    const hookLine = `「${hook}」`;
    const hookSize = fitFontSize(ctx, hookLine, titleMaxWidth, [27, 25, 23, 21], (size) => `500 ${size}px ${SERIF}`);
    ctx.fillStyle = "rgba(246,241,228,0.66)";
    ctx.font = `500 ${hookSize}px ${SERIF}`;
    ctx.fillText(fitText(ctx, hookLine, titleMaxWidth), pad, H - 118);
  }

  // 하단 — 이 곡의 키워드와 감정. 사이트가 이미 가진 어휘를 그대로 쓴다
  // (keywords는 곡의 소재, emotion은 감정 한 낱말). 워드마크 폭만큼은 비워 둔다.
  ctx.font = `500 24px ${SANS}`;
  const markW = (() => {
    ctx.save();
    ctx.font = "600 30px Georgia, serif";
    const w = ctx.measureText("Lyra.").width;
    ctx.restore();
    return w;
  })();
  const room = W - pad * 2 - markW - 32;
  const words = [...(song.keywords || []), song.emotion].filter(Boolean);
  let tagLine = "";
  for (const w of words) {
    const next = tagLine ? `${tagLine} #${w}` : `#${w}`;
    if (ctx.measureText(next).width > room) break; // 넘치면 거기서 끊는다 — 줄바꿈 없이 한 줄
    tagLine = next;
  }
  if (tagLine) {
    ctx.fillStyle = "rgba(246,241,228,0.45)";
    ctx.fillText(tagLine, pad, H - 52);
  }
  ctx.textAlign = "right";
  ctx.fillStyle = ink;
  ctx.font = "600 30px Georgia, serif";
  ctx.fillText("Lyra.", W - pad, H - 52);

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
  const artHeight = 570;
  if (art) drawImageCover(ctx, art, 0, 0, W, artHeight);
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
    const appearanceMaxW = Math.floor(maxW * 0.72);
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
    ctx.font = `500 23px ${SANS}`;
    wrap(ctx, appearance, appearanceMaxW).slice(0, 2).forEach((line, index) => {
      ctx.fillText(line, W - PAD, appearanceY + 38 + index * 32);
    });
    ctx.textAlign = "left";
  }

  // 설명 카드도 같은 표기 규칙을 쓴다: `원문 (한글 번역)` / `아티스트 (Feat. …)`.
  const titleParts = carouselTitleParts(song.title, song.artist);
  const displayTitle = carouselDisplayTitle(song.title, song.title_ko, song.artist);
  const artistLine = carouselArtistLine(song.artist, titleParts.qualifier);
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
    () => buildCarousel({ selected: selectedLines, note: song.comment || "", appearance: song.appearance || "" }),
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
          <p className="mb-2 text-xs leading-relaxed text-muted">가사 3장에 나누어 최대 15줄까지 선택할 수 있습니다.</p>
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
  const make = () => buildCaption(song);
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
