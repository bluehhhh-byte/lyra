"use client";
import { useEffect, useRef, useState } from "react";

// Stanza → 1080×1350 share card (blurred album art behind the lines).
// CardModal previews the card, lets the user pick which lines to include,
// then hands the PNG to the native share sheet (download fallback).
// All client-side, no deps.

const W = 1080;
const H = 1350;
const MAX_PAIRS = 6;

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

async function drawCard({ song, lines }) {
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

  // lyric lines — original (serif, bright) over translation (sans, dimmed);
  // shrink a step when more than 4 pairs are included
  const pairs = lines.slice(0, MAX_PAIRS);
  const big = pairs.length <= 4;
  const oSize = big ? 52 : 42;
  const tSize = big ? 36 : 30;
  const pad = 96;
  const maxW = W - pad * 2;
  const blocks = [];
  for (const l of pairs) {
    ctx.font = `600 ${oSize}px Georgia, 'Noto Serif KR', serif`;
    for (const t of wrap(ctx, l.en, maxW))
      blocks.push({ t, size: oSize, gap: oSize + 14, dim: false });
    if (l.ko) {
      ctx.font = `${tSize}px Pretendard, 'Apple SD Gothic Neo', sans-serif`;
      for (const t of wrap(ctx, l.ko, maxW))
        blocks.push({ t, size: tSize, gap: tSize + 14, dim: true });
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
    const size = 88;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(pad, fy, size, size, 16);
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

async function shareBlob(blob, song) {
  const file = new File([blob], `lyra-${song.slug}.png`, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `${song.title} — ${song.artist}` });
    } catch {} // dismissed the sheet — nothing to do
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CardModal({ song, stanza, onClose }) {
  const [sel, setSel] = useState(() => new Set(stanza.lines.slice(0, 4).map((_, i) => i)));
  const [url, setUrl] = useState(null);
  const blobRef = useRef(null);

  // re-render the preview whenever the selection changes
  useEffect(() => {
    let alive = true;
    const lines = stanza.lines.filter((_, i) => sel.has(i));
    if (!lines.length) return;
    drawCard({ song, lines }).then((blob) => {
      if (!alive || !blob) return;
      blobRef.current = blob;
      setUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
    });
    return () => {
      alive = false;
    };
  }, [sel, song, stanza]);

  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);

  const toggle = (i) =>
    setSel((old) => {
      const next = new Set(old);
      if (next.has(i)) next.delete(i);
      else if (next.size < MAX_PAIRS) next.add(i);
      return next.size ? next : old; // keep at least one line
    });

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-label="가사 카드 공유"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-sm overflow-y-auto rounded-2xl border border-line bg-bg p-4"
      >
        {url ? (
          <img src={url} alt="가사 카드 미리보기" className="w-full rounded-xl border border-line" />
        ) : (
          <div className="flex aspect-[4/5] items-center justify-center text-sm text-muted">
            카드 생성 중…
          </div>
        )}

        <p className="mb-1 mt-3 text-xs text-muted">포함할 줄 (최대 {MAX_PAIRS})</p>
        <ul className="max-h-36 space-y-1 overflow-y-auto">
          {stanza.lines.map((l, i) => (
            <li key={i}>
              <label className="flex cursor-pointer items-baseline gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={sel.has(i)}
                  onChange={() => toggle(i)}
                  className="translate-y-0.5 accent-(--color-accent)"
                />
                <span className={`truncate ${sel.has(i) ? "" : "text-muted"}`}>{l.en}</span>
              </label>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => blobRef.current && shareBlob(blobRef.current, song)}
            disabled={!url}
            className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40"
          >
            공유
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-accent"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
