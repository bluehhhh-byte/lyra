"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildCaption, buildCarouselCaption } from "../../../lib/caption";
import { buildCarousel, suggestHooks, groupByStanza, stanzaFits, CAROUSEL_SLIDES } from "../../../lib/carousel";

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
  // translated title in dimmer, smaller type right after — only when it differs
  // and it still fits before the right margin
  if (song.title_ko) {
    const after = tx + ctx.measureText(song.title).width + 12;
    ctx.font = "26px Pretendard, 'Apple SD Gothic Neo', sans-serif";
    const label = `(${song.title_ko})`;
    if (after + ctx.measureText(label).width <= W - pad) {
      ctx.fillStyle = inkDim;
      ctx.fillText(label, after, fy + 33);
      ctx.fillStyle = ink;
    }
  }
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
  const [sel, setSel] = useState(() => new Set(initial));
  const [align, setAlign] = useState("left");
  const [url, setUrl] = useState(null);
  const blobRef = useRef(null);
  // 발행 방식 — "one"은 기존 한 장짜리, "carousel"은 4장 묶음.
  // 캐러셀은 단일 이미지 대비 도달 3배·저장 9배다(2026 측정).
  const [mode, setMode] = useState("one");
  const [hookIndex, setHookIndex] = useState(() => initial?.[0] ?? 0);
  const [openingStanza, setOpeningStanza] = useState(null);
  const [cards, setCards] = useState([]); // [{ role, label, url }]
  const cardBlobs = useRef([]);
  const [building, setBuilding] = useState(false);

  const hookPicks = useMemo(() => suggestHooks(allLines, 8), [allLines]);
  const stanzaGroups = useMemo(() => groupByStanza(allLines).filter(stanzaFits), [allLines]);
  const carousel = useMemo(
    () => buildCarousel({ lines: allLines, hookIndex, note: song.comment || "", openingStanzaIndex: openingStanza }),
    [allLines, hookIndex, openingStanza, song.comment]
  );

  // re-render the preview whenever the selection or alignment changes
  useEffect(() => {
    if (mode !== "one") return;
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
  }, [sel, song, allLines, align, mode]);

  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);

  // 캐러셀 4장을 한꺼번에 그린다. 같은 drawCard를 반복 호출하므로 렌더링 규칙은
  // 한 장짜리와 완전히 같다 — 검증된 코드를 그대로 쓴다.
  useEffect(() => {
    if (mode !== "carousel" || !carousel.slides.length) return;
    let alive = true;
    setBuilding(true);
    (async () => {
      const made = [];
      for (const slide of carousel.slides) {
        const blob = await drawCard({ song, lines: slide.lines, align });
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
      setBuilding(false);
    })();
    return () => {
      alive = false;
    };
  }, [mode, carousel, song, align]);

  useEffect(() => () => cards.forEach((c) => URL.revokeObjectURL(c.url)), [cards]);

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
        {/* 발행 방식 — 캐러셀이 기본값은 아니다. 한 장짜리 공유도 그대로 남는다. */}
        <div className="mb-3 flex gap-1">
          {[["one", "한 장"], ["carousel", `캐러셀 ${CAROUSEL_SLIDES}장`]].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setMode(k)}
              aria-pressed={mode === k}
              className={`flex-1 rounded-lg border px-3 py-1.5 text-xs transition ${
                mode === k
                  ? "border-accent bg-accent font-semibold text-bg"
                  : "border-line text-muted hover:text-accent"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "carousel" ? (
          <>
            {carousel.error ? (
              <p className="rounded-xl border border-line px-3 py-6 text-center text-sm text-muted">{carousel.error}</p>
            ) : cards.length ? (
              // 인스타에서 넘겨 보는 순서 그대로 — 왼쪽부터 1장이다
              <ol className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
                {cards.map((c, i) => (
                  <li key={c.role} className="w-40 shrink-0 snap-center">
                    <img src={c.url} alt={`${i + 1}번째 카드 — ${c.label}`} className="w-full rounded-lg border border-line" />
                    <p className="mt-1 text-center text-[10px] text-muted">
                      {i + 1}. {c.label}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="flex aspect-[4/5] items-center justify-center text-sm text-muted">카드 생성 중…</div>
            )}
          </>
        ) : url ? (
          <img src={url} alt="가사 카드 미리보기" className="w-full rounded-xl border border-line" />
        ) : (
          <div className="flex aspect-[4/5] items-center justify-center text-sm text-muted">
            카드 생성 중…
          </div>
        )}

        <div className="mb-1 mt-3 flex items-center justify-between">
          <p className="text-xs text-muted">
            {mode === "carousel" ? "1장에 쓸 후크 한 줄" : `포함할 줄 (최대 ${MAX_PAIRS}) — 전체 가사에서 자유롭게`}
          </p>
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
        {mode === "carousel" && hookPicks.length > 0 && (
          // 923곡을 매번 통독하게 두지 않는다 — 짧고 1인칭인 줄을 먼저 내민다
          <div className="mb-2 flex flex-wrap gap-1">
            {hookPicks.map(({ index, line }) => (
              <button
                key={index}
                onClick={() => setHookIndex(index)}
                aria-pressed={hookIndex === index}
                className={`max-w-full truncate rounded-full border px-2.5 py-1 text-[11px] transition ${
                  hookIndex === index
                    ? "border-accent bg-accent font-semibold text-bg"
                    : "border-line text-muted hover:text-accent"
                }`}
              >
                {line.en}
              </button>
            ))}
          </div>
        )}

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
                  type={mode === "carousel" ? "radio" : "checkbox"}
                  name={mode === "carousel" ? "hook" : undefined}
                  checked={mode === "carousel" ? hookIndex === i : sel.has(i)}
                  onChange={() => (mode === "carousel" ? setHookIndex(i) : toggle(i))}
                  className="translate-y-0.5 accent-(--color-accent)"
                />
                <span className={`truncate ${(mode === "carousel" ? hookIndex === i : sel.has(i)) ? "" : "text-muted"}`}>
                  {l.en}
                </span>
              </label>
            </li>
          ))}
        </ul>

        {mode === "carousel" && stanzaGroups.length > 1 && (
          <div className="mt-2">
            <p className="mb-1 text-xs text-muted">2장에 쓸 여는 연</p>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setOpeningStanza(null)}
                aria-pressed={openingStanza === null}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                  openingStanza === null
                    ? "border-accent bg-accent font-semibold text-bg"
                    : "border-line text-muted hover:text-accent"
                }`}
              >
                자동
              </button>
              {stanzaGroups.map((g) => (
                <button
                  key={g.stanza}
                  onClick={() => setOpeningStanza(g.stanza)}
                  aria-pressed={openingStanza === g.stanza}
                  className={`max-w-full truncate rounded-full border px-2.5 py-1 text-[11px] transition ${
                    openingStanza === g.stanza
                      ? "border-accent bg-accent font-semibold text-bg"
                      : "border-line text-muted hover:text-accent"
                  }`}
                >
                  {g.section || g.items[0].en}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={() =>
              mode === "carousel"
                ? cardBlobs.current.length && downloadAll(cardBlobs.current, song)
                : blobRef.current && shareBlob(blobRef.current, song)
            }
            disabled={mode === "carousel" ? building || !cards.length : !url}
            className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg transition active:scale-[0.98] disabled:opacity-40"
          >
            {mode === "carousel" ? (building ? "만드는 중…" : `${cards.length}장 저장`) : "공유"}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-accent"
          >
            닫기
          </button>
        </div>

        <Caption song={song} mode={mode} hook={allLines[hookIndex]?.en || ""} />
      </div>
    </div>
  );
}

// Instagram post caption — 이미지와 함께 붙여넣을 텍스트. 복사 시점의 시각으로
// 타임스탬프를 다시 만든다.
function Caption({ song, mode = "one", hook = "" }) {
  const make = () => (mode === "carousel" ? buildCarouselCaption(song, hook) : buildCaption(song));
  const [text, setText] = useState(make);
  const [copied, setCopied] = useState(false);

  // 모드나 후크가 바뀌면 캡션도 따라 바뀐다 — 복사 버튼을 누르기 전에도 보여야 한다
  useEffect(() => setText(make()), [mode, hook, song]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <pre className="whitespace-pre-wrap rounded-lg border border-line bg-surface px-3 py-2 font-sans text-xs leading-relaxed text-ink">
        {text}
      </pre>
    </div>
  );
}
