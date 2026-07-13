"use client";
import { useEffect, useRef, useState } from "react";

// Stanza → 1080×1350 share card (flat dominant-color background from the album
// art, ink flips black/white to match). CardModal previews the card, lets the
// user pick which lines to include, then hands the PNG to the native share
// sheet (download fallback). All client-side, no deps.

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

// dominant color: downsample the art, bucket colors coarsely, score each bucket
// by count × saturation so a vivid album color beats a big gray area, and return
// the winning bucket's average. ponytail: 32-step quantization, no k-means.
function dominantColor(img) {
  const N = 32;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const x = c.getContext("2d");
  x.drawImage(img, 0, 0, N, N);
  const px = x.getImageData(0, 0, N, N).data;
  const buckets = new Map();
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const key = `${r >> 5},${g >> 5},${b >> 5}`;
    const bk = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0 };
    bk.r += r; bk.g += g; bk.b += b; bk.n++;
    buckets.set(key, bk);
  }
  let best = null, bestScore = -1;
  for (const bk of buckets.values()) {
    const r = bk.r / bk.n, g = bk.g / bk.n, b = bk.b / bk.n;
    const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    const score = bk.n * (0.15 + sat); // 0.15 keeps near-grays viable on mono art
    if (score > bestScore) { bestScore = score; best = { r, g, b }; }
  }
  return best;
}

// mix a color toward white (w>0) or black (w<0) — for the gradient's two ends
const mix = (c, w) => {
  const t = w > 0 ? 255 : 0;
  const f = Math.abs(w);
  return `rgb(${(c.r + (t - c.r) * f) | 0},${(c.g + (t - c.g) * f) | 0},${(c.b + (t - c.b) * f) | 0})`;
};

async function drawCard({ song, lines, gradSpec }) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // background — the artwork's dominant color, as a subtle gradient whose
  // form (linear angle or radial center) is random per modal open
  let art = null;
  let bg = { r: 13, g: 13, b: 15 };
  try {
    art = await loadImage(song.artwork);
    bg = dominantColor(art) || bg;
  } catch {}
  const g = gradSpec || { linear: true, a: 0.9, x: 0.5, y: 0.3 };
  const R = Math.hypot(W, H) / 2;
  const grad = g.linear
    ? ctx.createLinearGradient(
        W / 2 - Math.cos(g.a) * R, H / 2 - Math.sin(g.a) * R,
        W / 2 + Math.cos(g.a) * R, H / 2 + Math.sin(g.a) * R
      )
    : ctx.createRadialGradient(g.x * W, g.y * H, 0, g.x * W, g.y * H, R * 2);
  grad.addColorStop(0, mix(bg, 0.14)); // gently lit end
  grad.addColorStop(1, mix(bg, -0.18)); // gently shaded end
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // ink flips with the background's perceived brightness
  const dark = (0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b) / 255 < 0.55;
  const ink = dark ? "#f4f4f6" : "#141416";
  const inkDim = dark ? "rgba(244,244,246,0.62)" : "rgba(20,20,22,0.62)";

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
    ctx.fillStyle = b.dim ? inkDim : ink;
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
  ctx.fillStyle = ink;
  ctx.font = "600 34px Pretendard, 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText(song.title, tx, fy + 38);
  ctx.fillStyle = inkDim;
  ctx.font = "28px Pretendard, 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText(song.artist, tx, fy + 76);
  ctx.fillStyle = ink;
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

// `lines` is every line of the song (flattened; section set on stanza-opening
// lines), so the picker can mix lines from anywhere. `initial` seeds the
// selection with the stanza that was clicked.
export default function CardModal({ song, lines: allLines, initial, onClose }) {
  const [sel, setSel] = useState(() => new Set(initial));
  const [url, setUrl] = useState(null);
  const blobRef = useRef(null);
  // one random gradient form per modal open — stable across line toggles
  const [gradSpec] = useState(() => ({
    linear: Math.random() < 0.5,
    a: Math.random() * Math.PI * 2,
    x: 0.15 + Math.random() * 0.7,
    y: 0.15 + Math.random() * 0.7,
  }));

  // re-render the preview whenever the selection changes
  useEffect(() => {
    let alive = true;
    const lines = allLines.filter((_, i) => sel.has(i));
    if (!lines.length) return;
    drawCard({ song, lines, gradSpec }).then((blob) => {
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
  }, [sel, song, allLines]);

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

        <p className="mb-1 mt-3 text-xs text-muted">
          포함할 줄 (최대 {MAX_PAIRS}) — 전체 가사에서 자유롭게
        </p>
        <ul className="max-h-48 space-y-1 overflow-y-auto">
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
