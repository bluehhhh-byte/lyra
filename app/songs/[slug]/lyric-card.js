"use client";
import { useEffect, useRef, useState } from "react";
import { buildCaption } from "../../../lib/caption";

// Stanza → 1080×1350 share card (flat dominant-color background from the album
// art, ink flips black/white to match). CardModal previews the card, lets the
// user pick which lines to include, then hands the PNG to the native share
// sheet (download fallback). All client-side, no deps.

const W = 1080;
const H = 1350;
const MAX_PAIRS = 15;

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // required, or the canvas taints and toBlob throws
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// word-wrap that falls back to per-character breaks for spaceless CJK runs
export function wrap(ctx, text, maxW) {
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

async function drawCard({ song, lines, align = "left" }) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // background — the album cover, heavily blurred + darkened so the lyrics read.
  // ctx.filter blur is unsupported on Safari/iOS, so the blur is done by drawing
  // the art tiny (16px) and upscaling it — bilinear smoothing melts it into a
  // soft wash in every browser. A dark scrim on top then guarantees contrast,
  // whether or not the extra filter blur took effect.
  ctx.fillStyle = "#0d0d0f";
  ctx.fillRect(0, 0, W, H);
  let art = null;
  try {
    art = await loadImage(song.artwork);
    const D = 16; // smaller = blurrier
    const tmp = document.createElement("canvas");
    tmp.width = tmp.height = D;
    tmp.getContext("2d").drawImage(art, 0, 0, D, D);
    ctx.imageSmoothingEnabled = true;
    const s = Math.max(W, H) * 1.4; // overscan so no hard edges
    ctx.filter = "blur(40px)"; // extra softening where supported; ignored on Safari
    ctx.drawImage(tmp, (W - s) / 2, (H - s) / 2, s, s);
    ctx.filter = "none";
  } catch {}
  // dark scrim — the real legibility guarantee, applied regardless of blur support
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, W, H);

  // scrimmed dark background → light ink always reads
  const ink = "#f4f4f6";
  const inkDim = "rgba(244,244,246,0.62)";

  const pad = 96;

  // wordmark — top-right, clear of the lyric block
  ctx.fillStyle = ink;
  ctx.textAlign = "right";
  ctx.font = "600 34px Georgia, serif";
  ctx.fillText("Lyra.", W - pad, 104);

  // lyric lines — original (serif, bright) over translation (sans, dimmed).
  // Size steps down with the pair count, then a shrink-to-fit loop handles
  // what the tiers can't (wrapped lines, 15 dense pairs) — the fixed +14 line
  // paddings don't scale linearly with the font, so one pass can land short.
  const pairs = lines.slice(0, MAX_PAIRS);
  const tiers = [[4, 52, 36], [7, 42, 30], [10, 34, 24], [15, 26, 18]];
  let [, oSize, tSize] = tiers.find(([n]) => pairs.length <= n) || tiers.at(-1);
  const maxW = W - pad * 2;
  const build = () => {
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
      blocks.push({ t: "", size: 0, gap: Math.round(oSize * 0.55) });
    }
    return blocks;
  };
  let blocks = build();
  const top = 150; // below the wordmark
  const budget = H - 190 - top; // frame minus the 3-line footer minus headroom
  let totalH = blocks.reduce((acc, b) => acc + b.gap, 0);
  for (let guard = 4; totalH > budget && guard > 0; guard--) {
    const f = budget / totalH;
    oSize = Math.max(16, Math.round(oSize * f));
    tSize = Math.max(13, Math.round(tSize * f));
    blocks = build();
    totalH = blocks.reduce((acc, b) => acc + b.gap, 0);
  }
  let y = top + Math.max(0, (budget - totalH) / 2); // centered in the free space
  ctx.textAlign = align;
  const xText = align === "right" ? W - pad : align === "center" ? W / 2 : pad;
  for (const b of blocks) {
    y += b.gap;
    if (!b.t) continue;
    ctx.font = b.dim
      ? `${b.size}px Pretendard, 'Apple SD Gothic Neo', sans-serif`
      : `600 ${b.size}px Georgia, 'Noto Serif KR', serif`;
    ctx.fillStyle = b.dim ? inkDim : ink;
    ctx.fillText(b.t, xText, y);
  }

  // footer — small artwork, then title / artist / meta
  const fy = H - 170;
  if (art) {
    const size = 96;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(pad, fy, size, size, 16);
    ctx.clip();
    // cover-crop: a 2:3 movie poster would squish if drawn into a square, so
    // take the largest centered square of the source (no-op for square art)
    const side = Math.min(art.width, art.height);
    ctx.drawImage(art, (art.width - side) / 2, (art.height - side) / 2, side, side, pad, fy, size, size);
    ctx.restore();
  }
  const tx = pad + (art ? 120 : 0);
  ctx.textAlign = "left";
  ctx.fillStyle = ink;
  ctx.font = "600 34px Pretendard, 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText(song.title, tx, fy + 34);
  ctx.fillStyle = inkDim;
  ctx.font = "27px Pretendard, 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText(song.artist, tx, fy + 70);
  const meta = [song.album, song.year, song.genre].filter(Boolean).join(" · ");
  if (meta) {
    ctx.fillStyle = "rgba(244,244,246,0.4)"; // a step dimmer than inkDim — tertiary info
    ctx.font = "23px Pretendard, 'Apple SD Gothic Neo', sans-serif";
    ctx.fillText(meta, tx, fy + 104);
  }

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
  const [align, setAlign] = useState("left");
  const [url, setUrl] = useState(null);
  const blobRef = useRef(null);

  // re-render the preview whenever the selection or alignment changes
  useEffect(() => {
    let alive = true;
    const lines = allLines.filter((_, i) => sel.has(i));
    if (!lines.length) return;
    drawCard({ song, lines, align }).then((blob) => {
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
  }, [sel, song, allLines, align]);

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
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 opacity-100 transition-opacity duration-200 ease-out starting:opacity-0 motion-reduce:transition-none"
      role="dialog"
      aria-label="가사 카드 공유"
    >
      {/* modal: transform-origin stays centered (not trigger-anchored) by design */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-sm scale-100 overflow-y-auto rounded-2xl border border-line bg-bg p-4 opacity-100 transition duration-200 ease-out-strong starting:scale-[0.97] starting:opacity-0 motion-reduce:transition-none"
      >
        {url ? (
          <img src={url} alt="가사 카드 미리보기" className="w-full rounded-xl border border-line" />
        ) : (
          <div className="flex aspect-[4/5] items-center justify-center text-sm text-muted">
            카드 생성 중…
          </div>
        )}

        <div className="mb-1 mt-3 flex items-center justify-between">
          <p className="text-xs text-muted">포함할 줄 (최대 {MAX_PAIRS}) — 전체 가사에서 자유롭게</p>
          <div className="flex gap-1">
            {[["left", "좌", "왼쪽"], ["center", "중", "가운데"], ["right", "우", "오른쪽"]].map(([k, label, name]) => (
              <button
                key={k}
                onClick={() => setAlign(k)}
                aria-label={`${name} 정렬`}
                aria-pressed={align === k}
                className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
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
            className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg transition active:scale-[0.98] disabled:opacity-40"
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

        <Caption song={song} />
      </div>
    </div>
  );
}

// Instagram post caption — 이미지와 함께 붙여넣을 텍스트. 복사 시점의 시각으로
// 타임스탬프를 다시 만든다.
function Caption({ song }) {
  const [text, setText] = useState(() => buildCaption(song));
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const fresh = buildCaption(song); // 복사하는 순간의 년월일시로 갱신
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
      <pre className="whitespace-pre-wrap rounded-lg border border-line bg-surface px-3 py-2 font-sans text-xs leading-relaxed text-ink">
        {text}
      </pre>
    </div>
  );
}
