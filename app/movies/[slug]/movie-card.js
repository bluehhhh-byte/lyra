"use client";
import { useEffect, useRef, useState } from "react";
import { buildMovieCaption } from "../../../lib/caption";
import { loadImage, wrap } from "../../songs/[slug]/lyric-card";

// Movie share card — 1080×1350. Blurred poster background, the poster itself,
// title, star rating, and the 줄거리 synopsis. Client-side canvas, native share.
const W = 1080;
const H = 1350;

async function drawCard({ movie }) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // background — poster blurred (tiny-upscale, Safari-safe) + dark scrim.
  // TMDB images lack CORS headers, so load through our same-origin proxy or the
  // canvas taints and toBlob throws.
  ctx.fillStyle = "#0d0d0f";
  ctx.fillRect(0, 0, W, H);
  let poster = null;
  try {
    poster = await loadImage(`/api/img?url=${encodeURIComponent(movie.poster)}`);
    const D = 16;
    const tmp = document.createElement("canvas");
    tmp.width = tmp.height = D;
    tmp.getContext("2d").drawImage(poster, 0, 0, D, D);
    ctx.imageSmoothingEnabled = true;
    const s = Math.max(W, H) * 1.4;
    ctx.filter = "blur(40px)";
    ctx.drawImage(tmp, (W - s) / 2, (H - s) / 2, s, s);
    ctx.filter = "none";
  } catch {}
  ctx.fillStyle = "rgba(0,0,0,0.66)";
  ctx.fillRect(0, 0, W, H);

  const ink = "#f4f4f6";
  const inkDim = "rgba(244,244,246,0.62)";
  const inkFaint = "rgba(244,244,246,0.42)";
  const pad = 96;

  // wordmark — top-right
  ctx.fillStyle = ink;
  ctx.textAlign = "right";
  ctx.font = "600 34px Georgia, serif";
  ctx.fillText("Lyra.", W - pad, 100);

  // poster — centered near the top, 2:3
  const pw = 320;
  const ph = pw * 1.5;
  const px = (W - pw) / 2;
  const py = 150;
  if (poster) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, 20);
    ctx.clip();
    // cover-crop into the 2:3 box
    const sr = pw / ph;
    const ir = poster.width / poster.height;
    let sw = poster.width, sh = poster.height, sx = 0, sy = 0;
    if (ir > sr) { sw = poster.height * sr; sx = (poster.width - sw) / 2; }
    else { sh = poster.width / sr; sy = (poster.height - sh) / 2; }
    ctx.drawImage(poster, sx, sy, sw, sh, px, py, pw, ph);
    ctx.restore();
  }

  let y = py + ph + 68;
  ctx.textAlign = "center";

  // title (Korean)
  ctx.fillStyle = ink;
  ctx.font = "700 52px Pretendard, 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText(movie.title, W / 2, y);
  y += 44;

  // stars — filled row over an empty row, clipped to the score
  if (movie.rating != null) {
    ctx.font = "40px serif";
    const stars = "★★★★★";
    const sw = ctx.measureText(stars).width;
    const sx = (W - sw) / 2;
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(244,244,246,0.25)";
    ctx.fillText(stars, sx, y + 34);
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, y, sw * (movie.rating / 5), 60);
    ctx.clip();
    ctx.fillStyle = "#c8b6ff";
    ctx.fillText(stars, sx, y + 34);
    ctx.restore();
    ctx.textAlign = "center";
    y += 76;
  } else {
    y += 20;
  }

  // synopsis — wrapped, shrink-to-fit into the space above the footer
  const footerY = H - 110;
  let fontSize = 30;
  let lines = [];
  for (; fontSize >= 20; fontSize -= 2) {
    ctx.font = `${fontSize}px Pretendard, 'Apple SD Gothic Neo', sans-serif`;
    lines = wrap(ctx, movie.synopsis, W - pad * 2);
    if (y + lines.length * (fontSize + 14) <= footerY - 20) break;
  }
  ctx.fillStyle = inkDim;
  ctx.font = `${fontSize}px Pretendard, 'Apple SD Gothic Neo', sans-serif`;
  for (const t of lines) {
    y += fontSize + 14;
    ctx.fillText(t, W / 2, y);
  }

  // footer — director · year · genre
  const meta = [movie.director, movie.year, movie.genre].filter(Boolean).join(" · ");
  if (meta) {
    ctx.fillStyle = inkFaint;
    ctx.font = "24px Pretendard, 'Apple SD Gothic Neo', sans-serif";
    ctx.fillText(meta, W / 2, footerY);
  }

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

async function shareBlob(blob, movie) {
  const file = new File([blob], `lyra-${movie.slug}.png`, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `${movie.title} (${movie.year})` });
    } catch {}
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function MovieCardButton({ movie }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(null);
  const blobRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    drawCard({ movie }).then((blob) => {
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
  }, [open, movie]);

  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-full border border-line bg-bg/50 px-3 py-1.5 text-xs text-muted transition active:scale-[0.97] hover:text-accent"
      >
        카드 공유
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 opacity-100 transition-opacity duration-200 ease-out starting:opacity-0 motion-reduce:transition-none"
          role="dialog"
          aria-label="영화 카드 공유"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-full w-full max-w-sm scale-100 overflow-y-auto rounded-2xl border border-line bg-bg p-4 opacity-100 transition duration-200 ease-out starting:scale-[0.97] starting:opacity-0 motion-reduce:transition-none"
          >
            {url ? (
              <img src={url} alt="영화 카드 미리보기" className="w-full rounded-xl border border-line" />
            ) : (
              <div className="flex aspect-[4/5] items-center justify-center text-sm text-muted">카드 생성 중…</div>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => blobRef.current && shareBlob(blobRef.current, movie)}
                disabled={!url}
                className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg transition active:scale-[0.98] disabled:opacity-40"
              >
                공유
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border border-line px-4 py-2 text-sm text-muted transition hover:text-accent"
              >
                닫기
              </button>
            </div>
            <Caption movie={movie} />
          </div>
        </div>
      )}
    </>
  );
}

// Instagram post caption — 이미지와 함께 붙여넣을 텍스트. 복사 시점의 시각으로
// 타임스탬프를 다시 만든다.
function Caption({ movie }) {
  const [text, setText] = useState(() => buildMovieCaption(movie));
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const fresh = buildMovieCaption(movie);
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
