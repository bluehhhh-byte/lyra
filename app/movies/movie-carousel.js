"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildMovieCarouselCaption } from "../../lib/caption";
import {
  drawArtWash,
  drawImageCover,
  drawPageNumber,
  drawProgress,
  ensureCarouselFonts,
  fitText,
  loadImage,
  wrap,
} from "../songs/[slug]/lyric-card";

const W = 1080;
const H = 1350;
const PAD = 84;
const TOTAL_SLIDES = 5;
const POSTER_CONCURRENCY = 5;
const SANS = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", sans-serif';
const SERIF = 'Georgia, "Noto Serif KR", serif';
const INK = "#f7f7f8";
const DIM = "rgba(247,247,248,0.72)";

const proxiedPoster = (url) =>
  /^https:\/\/image\.tmdb\.org\/t\/p\//.test(url || "")
    ? `/api/img?url=${encodeURIComponent(url)}`
    : url;

async function loadPosters(movies) {
  const unique = [...new Map(movies.map((movie) => [movie.id, movie])).values()];
  const images = new Map();
  let cursor = 0;
  async function worker() {
    while (cursor < unique.length) {
      const movie = unique[cursor++];
      if (!movie.poster) {
        images.set(movie.id, null);
        continue;
      }
      try {
        images.set(movie.id, await loadImage(proxiedPoster(movie.poster)));
      } catch {
        images.set(movie.id, null);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(POSTER_CONCURRENCY, unique.length) }, worker));
  return images;
}

function canvas2d() {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  return { canvas, ctx: canvas.getContext("2d") };
}

const toBlob = (canvas) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG 생성에 실패했습니다."))), "image/png"),
  );

function roundedPoster(ctx, image, x, y, width, height, radius = 18) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.clip();
  drawImageCover(ctx, image, x, y, width, height);
  ctx.restore();
}

function posterFallback(ctx, movie, x, y, width, height, radius = 18) {
  ctx.fillStyle = "#29292e";
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(247,247,248,0.5)";
  ctx.font = `700 ${Math.max(30, Math.round(width * 0.18))}px ${SANS}`;
  ctx.fillText(String(movie.title || "?").trim().slice(0, 1), x + width / 2, y + height / 2 + 14);
}

function drawPoster(ctx, movie, images, x, y, width, height, radius) {
  const image = images.get(movie.id);
  if (image) roundedPoster(ctx, image, x, y, width, height, radius);
  else posterFallback(ctx, movie, x, y, width, height, radius);
}

async function drawCover(preset, images) {
  const { canvas, ctx } = canvas2d();
  const lead = images.get(preset.slides[0].movies[0]?.id);
  drawArtWash(ctx, lead, 0.74);

  const posters = preset.slides[0].movies.slice(0, 3);
  posters.forEach((movie, index) => drawPoster(ctx, movie, images, 125 + index * 285, 145, 260, 390, 22));

  const fade = ctx.createLinearGradient(0, 430, 0, 760);
  fade.addColorStop(0, "rgba(13,13,15,0)");
  fade.addColorStop(1, "rgba(13,13,15,0.98)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 430, W, 330);

  ctx.textAlign = "left";
  ctx.fillStyle = DIM;
  ctx.font = `700 26px ${SANS}`;
  ctx.fillText("CYNO SELECTION", PAD, 750);
  ctx.fillStyle = INK;
  ctx.font = `800 68px ${SANS}`;
  const headline = wrap(ctx, preset.headline, W - PAD * 2).slice(0, 3);
  headline.forEach((line, index) => ctx.fillText(line, PAD, 840 + index * 84));

  const detailY = Math.max(1060, 840 + headline.length * 84 + 28);
  ctx.fillStyle = DIM;
  ctx.font = `500 30px ${SANS}`;
  ctx.fillText(`별점순 상위 ${preset.selectedCount}편`, PAD, detailY);
  if (preset.omittedCount > 0) {
    ctx.fillStyle = "#c8b6ff";
    ctx.font = `700 28px ${SANS}`;
    ctx.fillText(`외 ${preset.omittedCount}편`, PAD, detailY + 48);
  }

  ctx.fillStyle = INK;
  ctx.font = `600 34px ${SERIF}`;
  ctx.textAlign = "right";
  ctx.fillText("Cyno.", W - PAD, H - 64);
  drawProgress(ctx, 1, TOTAL_SLIDES);
  return toBlob(canvas);
}

async function drawList(slide, images, position, total, preset) {
  const { canvas, ctx } = canvas2d();
  ctx.fillStyle = "#0d0d0f";
  ctx.fillRect(0, 0, W, H);
  const wash = ctx.createLinearGradient(0, 0, W, H);
  wash.addColorStop(0, "rgba(200,182,255,0.08)");
  wash.addColorStop(0.5, "rgba(13,13,15,0)");
  wash.addColorStop(1, "rgba(105,169,255,0.05)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = `600 34px ${SERIF}`;
  ctx.fillText("Cyno.", PAD, 102);
  ctx.fillStyle = DIM;
  ctx.font = `600 24px ${SANS}`;
  ctx.fillText(`${preset.label} · ${slide.range[0]}–${slide.range[1]}`, PAD, 140);
  drawPageNumber(ctx, position, total);

  const columns = slide.grid.columns;
  const rows = slide.grid.rows;
  const areaTop = 178;
  const areaBottom = 1242;
  const rowGap = rows === 3 ? 20 : 34;
  const rowHeight = (areaBottom - areaTop - rowGap * Math.max(0, rows - 1)) / rows;
  const baseCellWidth = (W - PAD * 2) / columns;

  for (let row = 0; row < rows; row++) {
    const start = row * columns;
    const rowMovies = slide.movies.slice(start, start + columns);
    const rowWidth = rowMovies.length * baseCellWidth;
    const rowX = (W - rowWidth) / 2;
    for (let col = 0; col < rowMovies.length; col++) {
      const movie = rowMovies[col];
      const cellX = rowX + col * baseCellWidth;
      const posterHeight = Math.min(rowHeight - 66, rows === 3 ? 284 : 430);
      const posterWidth = posterHeight / 1.5;
      const posterX = cellX + (baseCellWidth - posterWidth) / 2;
      const posterY = areaTop + row * (rowHeight + rowGap);
      drawPoster(ctx, movie, images, posterX, posterY, posterWidth, posterHeight, 14);

      ctx.textAlign = "center";
      ctx.fillStyle = INK;
      ctx.font = `700 ${rows === 3 ? 28 : 34}px ${SANS}`;
      ctx.fillText(fitText(ctx, movie.title, baseCellWidth - 18), cellX + baseCellWidth / 2, posterY + posterHeight + 31);
      ctx.fillStyle = DIM;
      ctx.font = `600 ${rows === 3 ? 23 : 28}px ${SANS}`;
      const rating = Number.isInteger(movie.rating) ? movie.rating : movie.rating.toFixed(1);
      ctx.fillText(`${movie.year || "연도 미상"} · ★${rating}`, cellX + baseCellWidth / 2, posterY + posterHeight + 58);
    }
  }

  drawProgress(ctx, position, total);
  return toBlob(canvas);
}

async function drawClosing(slide, images, position, total) {
  const { canvas, ctx } = canvas2d();
  const movie = slide.movie;
  const poster = movie ? images.get(movie.id) : null;
  ctx.fillStyle = "#0d0d0f";
  ctx.fillRect(0, 0, W, H);
  if (poster) drawImageCover(ctx, poster, 0, 0, W, 760);
  else if (movie) posterFallback(ctx, movie, 0, 0, W, 760, 0);

  const fade = ctx.createLinearGradient(0, 390, 0, 860);
  fade.addColorStop(0, "rgba(13,13,15,0)");
  fade.addColorStop(0.68, "rgba(13,13,15,0.94)");
  fade.addColorStop(1, "#0d0d0f");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 390, W, 470);
  drawPageNumber(ctx, position, total);

  ctx.textAlign = "left";
  ctx.fillStyle = "#c8b6ff";
  ctx.font = `700 24px ${SANS}`;
  ctx.fillText("CYNO NOTE", PAD, 704);
  ctx.fillStyle = INK;
  ctx.font = `800 38px ${SANS}`;
  ctx.fillText(fitText(ctx, movie?.title || "Cyno.", W - PAD * 2), PAD, 762);

  const comment = slide.comment || "Cyno에 남긴 영화 기록을 계속 소개합니다.";
  let size = 52;
  let lines = [];
  const quoteInset = 58;
  for (; size >= 32; size -= 2) {
    ctx.font = `500 ${size}px ${SANS}`;
    lines = wrap(ctx, comment, W - PAD * 2 - quoteInset);
    if (lines.length * (size + 20) <= 280) break;
  }
  ctx.fillStyle = "#c8b6ff";
  ctx.font = `700 82px ${SERIF}`;
  ctx.fillText("“", PAD - 6, 872);
  ctx.fillStyle = INK;
  ctx.font = `500 ${size}px ${SANS}`;
  lines.slice(0, 6).forEach((line, index) =>
    ctx.fillText(line, PAD + quoteInset, 858 + index * (size + 20)),
  );

  ctx.fillStyle = DIM;
  ctx.font = `500 24px ${SANS}`;
  ctx.fillText([movie?.director, movie?.year, movie && `★${movie.rating}`].filter(Boolean).join(" · "), PAD, H - 108);
  ctx.fillStyle = INK;
  ctx.font = `700 24px ${SANS}`;
  ctx.textAlign = "right";
  ctx.fillText("@lyra.syno", W - PAD, H - 104);
  drawProgress(ctx, position, total);
  return toBlob(canvas);
}

async function downloadAll(blobs, preset) {
  const files = blobs.map(
    (blob, index) => new File([blob], `cyno-${preset.id}-${String(index + 1).padStart(2, "0")}.png`, { type: "image/png" }),
  );
  if (navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files, title: preset.headline });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
    }
  }
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return "downloaded";
}

export default function MovieCarouselButton({ presets }) {
  const [open, setOpen] = useState(false);
  const [presetId, setPresetId] = useState(presets[0]?.id || "");
  const [cards, setCards] = useState([]);
  const [activeCard, setActiveCard] = useState(0);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const blobs = useRef([]);
  const preset = useMemo(() => presets.find((item) => item.id === presetId) || presets[0], [presetId, presets]);

  useEffect(() => {
    if (!open || !preset) return;
    let alive = true;
    setBuilding(true);
    setError("");
    setSaveStatus("");
    blobs.current = [];
    setCards((old) => {
      old.forEach((card) => URL.revokeObjectURL(card.url));
      return [];
    });
    (async () => {
      const made = [];
      try {
        const movies = preset.slides.flatMap((slide) => slide.movies || (slide.movie ? [slide.movie] : []));
        const [, images] = await Promise.all([ensureCarouselFonts(), loadPosters(movies)]);
        for (const [index, slide] of preset.slides.entries()) {
          const position = index + 1;
          const blob =
            slide.role === "cover"
              ? await drawCover(preset, images)
              : slide.role === "closing"
                ? await drawClosing(slide, images, position, preset.slides.length)
                : await drawList(slide, images, position, preset.slides.length, preset);
          if (!alive) return;
          made.push({ ...slide, blob, url: URL.createObjectURL(blob) });
        }
        if (!alive) return;
        if (made.length !== TOTAL_SLIDES) throw new Error("카드 5장을 모두 만들지 못했습니다.");
        setCards(made);
        blobs.current = made.map((card) => card.blob);
        setActiveCard(0);
      } catch {
        made.forEach((card) => URL.revokeObjectURL(card.url));
        if (alive) setError("카드를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        if (alive) setBuilding(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, preset]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => () => cards.forEach((card) => URL.revokeObjectURL(card.url)), [cards]);

  if (!presets.length) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-accent/40 bg-accent/10 px-3.5 py-1.5 text-xs font-semibold text-accent transition active:scale-[0.97] hover:bg-accent/15"
      >
        캐러셀 만들기
      </button>

      {open && preset && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-2 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Cyno 캐러셀 만들기"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-full min-w-0 max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-2xl border border-line bg-bg p-3 sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-5xl sm:p-6"
          >
            <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">Cyno 캐러셀 · 5장</p>
                <p className="mt-0.5 truncate text-xs text-muted">주제만 고르면 편집 없이 자동으로 완성됩니다.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs text-muted hover:text-accent">
                닫기
              </button>
            </div>

            <div className="grid min-h-0 min-w-0 flex-1 gap-4 overflow-y-auto overscroll-contain pr-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)] lg:gap-6">
              <section className="min-w-0" aria-label="캐러셀 미리보기">
                {cards.length ? (
                  <>
                    <img
                      src={cards[activeCard]?.url}
                      alt={`${activeCard + 1}번째 카드 — ${cards[activeCard]?.label}`}
                      draggable={false}
                      className="mx-auto max-h-[42dvh] w-auto max-w-full rounded-xl border border-line shadow-2xl sm:max-h-[56dvh] lg:max-h-[62vh]"
                    />
                    <ol className="mt-2 grid min-w-0 grid-cols-5 gap-1.5 sm:mt-3 sm:gap-2">
                      {cards.map((card, index) => (
                        <li key={`${card.role}-${index}`} className="min-w-0">
                          <button
                            type="button"
                            onClick={() => setActiveCard(index)}
                            aria-label={`${index + 1}번째 카드 보기`}
                            aria-pressed={activeCard === index}
                            className={`w-full min-w-0 rounded-lg border p-1 ${activeCard === index ? "border-accent bg-accent/10" : "border-line opacity-60 hover:opacity-100"}`}
                          >
                            <img src={card.url} alt="" draggable={false} className="aspect-[4/5] w-full rounded object-cover" />
                            <span className="mt-1 block truncate text-[10px] text-muted">{index + 1}. {card.label}</span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  </>
                ) : (
                  <div className="flex h-[42dvh] max-h-[420px] items-center justify-center rounded-xl border border-line text-sm text-muted sm:h-auto sm:aspect-[4/5]">
                    {building ? "포스터와 카드 생성 중…" : error || "카드를 만들 수 없습니다."}
                  </div>
                )}
              </section>

              <section className="min-w-0" aria-label="주제 선택과 저장">
                <p className="mb-2 text-xs font-semibold text-muted">발행 주제</p>
                <div className="grid gap-2">
                  {presets.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPresetId(item.id)}
                      aria-pressed={item.id === preset.id}
                      className={`min-w-0 rounded-xl border px-3 py-2.5 text-left transition ${item.id === preset.id ? "border-accent bg-accent/10" : "border-line hover:border-accent/50"}`}
                    >
                      <span className="block truncate text-sm font-semibold">{item.label}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        전체 {item.total}편 · 상위 {item.selectedCount}편
                        {item.omittedCount > 0 && ` · 외 ${item.omittedCount}편`}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-line bg-surface px-3 py-3 text-xs leading-5 text-muted">
                  <p className="font-semibold text-ink">{preset.headline}</p>
                  <p>별점 내림차순, 동점은 최신 연도순으로 자동 배치합니다.</p>
                  <p>맺음: {preset.closing.movie.title}의 Cyno 코멘트</p>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    if (!blobs.current.length) return;
                    setSaveStatus("");
                    const result = await downloadAll(blobs.current, preset);
                    if (result === "shared") setSaveStatus("공유 시트로 5장을 전달했습니다.");
                    if (result === "downloaded") setSaveStatus("01부터 05까지 순서대로 저장했습니다.");
                  }}
                  disabled={building || cards.length !== TOTAL_SLIDES}
                  className="mt-4 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition active:scale-[0.98] disabled:opacity-40"
                >
                  {building ? "만드는 중…" : "5장 저장"}
                </button>
                <p className="mt-2 min-h-5 text-xs text-muted" aria-live="polite">
                  {error || saveStatus}
                </p>
                <CarouselCaption key={preset.id} preset={preset} />
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CarouselCaption({ preset }) {
  const make = () => buildMovieCarouselCaption(preset);
  const [text, setText] = useState(make);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const fresh = make();
    setText(fresh);
    try {
      await navigator.clipboard.writeText(fresh);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-muted">인스타그램 캡션</span>
        <button type="button" onClick={copy} className="text-xs text-accent hover:underline">{copied ? "복사됨 ✓" : "복사"}</button>
      </div>
      <pre className="whitespace-pre-wrap rounded-lg border border-line bg-surface px-3 py-2 font-sans text-xs leading-relaxed text-ink">{text}</pre>
    </div>
  );
}
