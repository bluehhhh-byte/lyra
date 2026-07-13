"use client";

// Renders one stanza onto a 1080×1350 canvas (blurred album art behind the
// lines) and hands it to the native share sheet — falls back to a download
// where Web Share can't send files. All client-side, no deps.

const W = 1080;
const H = 1350;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // required, or the canvas taints and toBlob throws
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// word-wrap that falls back to per-character breaks for spaceless CJK runs
function wrap(ctx, text, maxW) {
  const out = [];
  let line = "";
  for (const word of text.split(" ")) {
    const tryLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(tryLine).width <= maxW) {
      line = tryLine;
      continue;
    }
    if (line) out.push(line);
    if (ctx.measureText(word).width <= maxW) {
      line = word;
      continue;
    }
    line = "";
    for (const ch of word) {
      if (ctx.measureText(line + ch).width > maxW) {
        out.push(line);
        line = ch;
      } else line += ch;
    }
  }
  if (line) out.push(line);
  return out;
}

async function drawCard({ song, stanza }) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // background — blurred, darkened artwork; plain dark if the image won't load
  ctx.fillStyle = "#0d0d0f";
  ctx.fillRect(0, 0, W, H);
  let art = null;
  try {
    art = await loadImage(song.artwork);
    const s = Math.max(W, H) * 1.3; // overscan so the blur has no hard edges
    ctx.filter = "blur(60px) brightness(0.35)";
    ctx.drawImage(art, (W - s) / 2, (H - s) / 2, s, s);
    ctx.filter = "none";
  } catch {}

  // lyric lines — original (serif, bright) over translation (sans, dimmed),
  // capped at 4 pairs so the card never gets cramped
  const pad = 96;
  const maxW = W - pad * 2;
  const pairs = stanza.lines.slice(0, 4);
  const blocks = [];
  for (const l of pairs) {
    ctx.font = "600 52px Georgia, 'Noto Serif KR', serif";
    for (const t of wrap(ctx, l.en, maxW)) blocks.push({ t, size: 52, gap: 66, dim: false });
    if (l.ko) {
      ctx.font = "36px Pretendard, 'Apple SD Gothic Neo', sans-serif";
      for (const t of wrap(ctx, l.ko, maxW)) blocks.push({ t, size: 36, gap: 50, dim: true });
    }
    blocks.push({ t: "", size: 0, gap: 28 });
  }
  const totalH = blocks.reduce((n, b) => n + b.gap, 0);
  let y = (H - 160 - totalH) / 2 + 40; // center in the space above the footer
  ctx.textAlign = "left";
  for (const b of blocks) {
    y += b.gap;
    if (!b.t) continue;
    ctx.font = b.dim
      ? `${b.size}px Pretendard, 'Apple SD Gothic Neo', sans-serif`
      : `600 ${b.size}px Georgia, 'Noto Serif KR', serif`;
    ctx.fillStyle = b.dim ? "rgba(237,237,240,0.55)" : "#ededf0";
    ctx.fillText(b.t, pad, y);
  }

  // footer — small artwork, title/artist, wordmark
  const fy = H - 150;
  if (art) {
    const r = 16;
    const size = 88;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(pad, fy, size, size, r);
    ctx.clip();
    ctx.drawImage(art, pad, fy, size, size);
    ctx.restore();
  }
  const tx = pad + (art ? 112 : 0);
  ctx.fillStyle = "#ededf0";
  ctx.font = "600 34px Pretendard, 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText(song.title, tx, fy + 38);
  ctx.fillStyle = "rgba(237,237,240,0.55)";
  ctx.font = "28px Pretendard, 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText(song.artist, tx, fy + 76);
  ctx.fillStyle = "#c8b6ff";
  ctx.textAlign = "right";
  ctx.font = "600 30px Georgia, serif";
  ctx.fillText("Lyra.", W - pad, fy + 76);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export async function shareStanzaCard({ song, stanza }) {
  const blob = await drawCard({ song, stanza });
  if (!blob) return;
  const file = new File([blob], `lyra-${song.slug}.png`, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `${song.title} — ${song.artist}` });
      return;
    } catch {} // dismissed the sheet → fall through to download? no — dismissal means stop
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
}
