"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildMovieCarouselCaption } from "../../../lib/caption";
import { buildSingleMovieCarousel } from "../../../lib/movie-carousel";
import {
  drawArtWash,
  drawImageCover,
  drawPageNumber,
  drawProgress,
  ensureCarouselFonts,
  fitText,
  loadImage,
  wrap,
} from "../../songs/[slug]/lyric-card";

const W = 1080;
const H = 1350;
const PAD = 84;
const TOTAL_SLIDES = 5;
const POSTER_CONCURRENCY = 5;
const SANS = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", sans-serif';
const SERIF = 'Georgia, "Noto Serif KR", serif';
const BG = "#0d0d0f";
const INK = "#f7f7f8";
const DIM = "rgba(247,247,248,0.7)";
const ACCENT = "#c8b6ff";

const proxiedPoster = (url) =>
  /^https:\/\/image\.tmdb\.org\/t\/p\//.test(url || "") ? `/api/img?url=${encodeURIComponent(url)}` : url;

async function loadPosters(movies) {
  const unique = [...new Map(movies.map((movie) => [movie.id, movie])).values()];
  const images = new Map();
  let cursor = 0;
  async function worker() {
    while (cursor < unique.length) {
      const movie = unique[cursor++];
      try {
        images.set(movie.id, movie.poster ? await loadImage(proxiedPoster(movie.poster)) : null);
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
  ctx.fillStyle = "rgba(247,247,248,0.55)";
  ctx.textAlign = "center";
  ctx.font = `700 ${Math.max(30, Math.round(width * 0.18))}px ${SANS}`;
  ctx.fillText(String(movie?.title || "?").slice(0, 1), x + width / 2, y + height / 2 + 14);
}

function drawPoster(ctx, movie, images, x, y, width, height, radius = 18) {
  const image = movie && images.get(movie.id);
  if (image) roundedPoster(ctx, image, x, y, width, height, radius);
  else posterFallback(ctx, movie, x, y, width, height, radius);
}

function base(ctx, image, opacity = 0.82) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  if (image) drawArtWash(ctx, image, opacity);
  const shade = ctx.createLinearGradient(0, 0, W, H);
  shade.addColorStop(0, "rgba(200,182,255,0.08)");
  shade.addColorStop(0.55, "rgba(13,13,15,0.35)");
  shade.addColorStop(1, "rgba(13,13,15,0.86)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
}

function header(ctx, label, position, total = TOTAL_SLIDES) {
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = `600 34px ${SERIF}`;
  ctx.fillText("Cyno.", PAD, 98);
  ctx.fillStyle = ACCENT;
  ctx.font = `700 23px ${SANS}`;
  ctx.fillText(label.toUpperCase(), PAD, 142);
  drawPageNumber(ctx, position, total);
}

function drawFittedParagraph(ctx, text, x, y, width, maxHeight, startSize = 46, minSize = 27, color = INK) {
  let size = startSize;
  let lines = [];
  for (; size >= minSize; size -= 2) {
    ctx.font = `500 ${size}px ${SANS}`;
    lines = wrap(ctx, text || "기록된 설명이 없습니다.", width);
    if (lines.length * (size * 1.55) <= maxHeight) break;
  }
  ctx.fillStyle = color;
  ctx.font = `500 ${size}px ${SANS}`;
  lines.slice(0, Math.floor(maxHeight / (size * 1.55))).forEach((line, index) => ctx.fillText(line, x, y + index * size * 1.55));
}

function drawFittedParagraphs(ctx, paragraphs, x, y, width, maxHeight) {
  const source = (paragraphs || []).filter(Boolean);
  let size = 50;
  let lines = [];
  for (; size >= 28; size -= 2) {
    ctx.font = `500 ${size}px ${SANS}`;
    lines = source.flatMap((paragraph, index) => [
      ...wrap(ctx, paragraph, width).map((text) => ({ text, gap: size * 1.5 })),
      ...(index < source.length - 1 ? [{ text: "", gap: size * 0.7 }] : []),
    ]);
    if (lines.reduce((sum, line) => sum + line.gap, 0) <= maxHeight) break;
  }
  ctx.fillStyle = INK;
  ctx.font = `500 ${size}px ${SANS}`;
  let lineY = y;
  for (const line of lines) {
    if (lineY + line.gap > y + maxHeight) break;
    lineY += line.gap;
    if (line.text) ctx.fillText(line.text, x, lineY);
  }
}

async function drawSingle(slide, images, position, carousel) {
  const { canvas, ctx } = canvas2d();
  const movie = slide.movie;
  const image = images.get(movie.id);
  base(ctx, image, slide.role === "cover" ? 0.62 : 0.9);

  if (slide.role === "cover") {
    drawPoster(ctx, movie, images, 520, 130, 430, 645, 28);
    const fade = ctx.createLinearGradient(0, 640, 0, 1010);
    fade.addColorStop(0, "rgba(13,13,15,0)");
    fade.addColorStop(0.7, "rgba(13,13,15,0.94)");
    fade.addColorStop(1, BG);
    ctx.fillStyle = fade;
    ctx.fillRect(0, 580, W, 500);
    ctx.fillStyle = ACCENT;
    ctx.font = `700 25px ${SANS}`;
    ctx.fillText(`ONE FILM · ${carousel.slides.length} CARDS`, PAD, 705);
    ctx.fillStyle = INK;
    ctx.font = `800 74px ${SANS}`;
    wrap(ctx, carousel.headline, 820).slice(0, 3).forEach((line, index) => ctx.fillText(line, PAD, 815 + index * 88));
    ctx.fillStyle = DIM;
    ctx.font = `500 29px ${SANS}`;
    ctx.fillText([movie.director, movie.year, movie.country, movie.genre].filter(Boolean).join(" · "), PAD, 1110);
    if (movie.rating != null) {
      ctx.fillStyle = ACCENT;
      ctx.font = `700 28px ${SANS}`;
      ctx.fillText(`MY RATING  ★ ${movie.rating}`, PAD, 1165);
    }
    ctx.fillStyle = INK;
    ctx.font = `600 34px ${SERIF}`;
    ctx.fillText("Cyno.", PAD, H - 74);
  } else if (slide.role === "about") {
    header(ctx, "FILM NOTE · 총평", position, carousel.slides.length);
    drawPoster(ctx, movie, images, PAD, 205, 300, 450, 22);
    const facts = [
      ["DIRECTOR", movie.director],
      ["YEAR", movie.year],
      ["COUNTRY", movie.country],
      ["GENRE", movie.genre],
      ["RATING", movie.rating != null && `★ ${movie.rating}`],
    ].filter(([, value]) => value);
    facts.forEach(([label, value], index) => {
      const y = 238 + index * 94;
      ctx.fillStyle = ACCENT;
      ctx.font = `700 20px ${SANS}`;
      ctx.fillText(label, 430, y);
      ctx.fillStyle = INK;
      ctx.font = `600 30px ${SANS}`;
      wrap(ctx, value, 550).slice(0, 2).forEach((line, lineIndex) => ctx.fillText(line, 430, y + 38 + lineIndex * 34));
    });
    ctx.fillStyle = "rgba(13,13,15,0.82)";
    ctx.beginPath(); ctx.roundRect(PAD, 725, W - PAD * 2, 465, 26); ctx.fill();
    drawFittedParagraph(ctx, slide.text || "기록된 총평이 없습니다.", PAD + 44, 800, W - PAD * 2 - 88, 320, 44, 29);
  } else if (slide.role === "body") {
    header(ctx, `${slide.bodyLabel === "작품 노트" ? "REVIEW" : "STORY"} · ${slide.label}`, position, carousel.slides.length);
    ctx.fillStyle = "rgba(13,13,15,0.84)";
    ctx.beginPath(); ctx.roundRect(PAD, 205, W - PAD * 2, 990, 30); ctx.fill();
    ctx.fillStyle = ACCENT;
    ctx.font = `800 30px ${SANS}`;
    ctx.fillText(movie.title, PAD + 48, 285);
    drawFittedParagraphs(ctx, slide.paragraphs, PAD + 48, 330, W - PAD * 2 - 96, 790);
  }
  drawProgress(ctx, position, carousel.slides.length);
  return toBlob(canvas);
}

async function drawCurationCover(slide, images, carousel) {
  const { canvas, ctx } = canvas2d();
  const lead = slide.movies[0] && images.get(slide.movies[0].id);
  base(ctx, lead, 0.68);
  slide.movies.slice(0, 3).forEach((movie, index) => drawPoster(ctx, movie, images, 125 + index * 285, 145, 260, 390, 22));
  ctx.fillStyle = ACCENT;
  ctx.font = `700 25px ${SANS}`;
  ctx.fillText("CONCEPT CURATION", PAD, 690);
  ctx.fillStyle = INK;
  ctx.font = `800 68px ${SANS}`;
  wrap(ctx, carousel.headline, W - PAD * 2).slice(0, 3).forEach((line, index) => ctx.fillText(line, PAD, 790 + index * 82));
  ctx.fillStyle = DIM;
  ctx.font = `500 28px ${SANS}`;
  ctx.fillText(`자동 선정 ${carousel.selectedCount}편${carousel.omittedCount ? ` · 외 ${carousel.omittedCount}편` : ""}`, PAD, 1080);
  ctx.fillStyle = INK;
  ctx.font = `600 34px ${SERIF}`;
  ctx.fillText("Cyno.", PAD, H - 74);
  drawProgress(ctx, 1, TOTAL_SLIDES);
  return toBlob(canvas);
}

async function drawCurationList(slide, images, position, carousel) {
  const { canvas, ctx } = canvas2d();
  base(ctx, null);
  header(ctx, `${carousel.label} · ${slide.label}`, position);
  const movies = slide.movies || [];
  if (!movies.length) {
    ctx.fillStyle = DIM;
    ctx.font = `600 34px ${SANS}`;
    ctx.fillText("이 장에 배치할 추가 후보가 없습니다.", PAD, 630);
  }
  const columns = slide.grid.columns || 1;
  const rows = slide.grid.rows || 1;
  const cellWidth = (W - PAD * 2) / columns;
  const cellHeight = 940 / rows;
  movies.forEach((movie, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const x = PAD + col * cellWidth;
    const y = 210 + row * cellHeight;
    const posterHeight = Math.min(360, cellHeight - 80);
    const posterWidth = posterHeight / 1.5;
    drawPoster(ctx, movie, images, x + (cellWidth - posterWidth) / 2, y, posterWidth, posterHeight, 14);
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.font = `700 27px ${SANS}`;
    ctx.fillText(fitText(ctx, movie.title, cellWidth - 20), x + cellWidth / 2, y + posterHeight + 34);
    ctx.fillStyle = DIM;
    ctx.font = `500 22px ${SANS}`;
    ctx.fillText([movie.year, movie.rating != null && `★${movie.rating}`].filter(Boolean).join(" · "), x + cellWidth / 2, y + posterHeight + 65);
    ctx.textAlign = "left";
  });
  drawProgress(ctx, position, TOTAL_SLIDES);
  return toBlob(canvas);
}

async function drawCurationNote(slide, images, position, carousel) {
  const { canvas, ctx } = canvas2d();
  const movie = slide.movie;
  base(ctx, movie && images.get(movie.id), 0.82);
  header(ctx, "CURATION NOTE · 선정 노트", position);
  if (movie) drawPoster(ctx, movie, images, PAD, 220, 300, 450, 22);
  ctx.fillStyle = INK;
  ctx.font = `800 48px ${SANS}`;
  wrap(ctx, movie?.title || carousel.label, 560).slice(0, 2).forEach((line, index) => ctx.fillText(line, 450, 305 + index * 58));
  ctx.fillStyle = "rgba(13,13,15,0.82)";
  ctx.beginPath(); ctx.roundRect(PAD, 760, W - PAD * 2, 400, 28); ctx.fill();
  drawFittedParagraph(ctx, slide.comment, PAD + 48, 840, W - PAD * 2 - 96, 260, 46, 29);
  drawProgress(ctx, position, TOTAL_SLIDES);
  return toBlob(canvas);
}

async function renderCarousel(carousel) {
  const movies = carousel.slides.flatMap((slide) => slide.movies || (slide.movie ? [slide.movie] : []));
  const [, images] = await Promise.all([ensureCarouselFonts(), loadPosters(movies)]);
  const made = [];
  for (const [index, slide] of carousel.slides.entries()) {
    const position = index + 1;
    let blob;
    if (carousel.kind === "single") blob = await drawSingle(slide, images, position, carousel);
    else if (slide.role === "curation-cover") blob = await drawCurationCover(slide, images, carousel);
    else if (slide.role === "curation-list") blob = await drawCurationList(slide, images, position, carousel);
    else blob = await drawCurationNote(slide, images, position, carousel);
    made.push({ ...slide, blob, url: URL.createObjectURL(blob) });
  }
  return made;
}

async function downloadAll(blobs, carousel) {
  const files = blobs.map((blob, index) => new File([blob], `cyno-${carousel.id}-${String(index + 1).padStart(2, "0")}.png`, { type: "image/png" }));
  if (navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files, title: carousel.headline });
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
    await new Promise((resolve) => setTimeout(resolve, 220));
  }
  return "downloaded";
}

async function adminApi(action, body) {
  const response = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

const inputClass = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base outline-none transition focus:border-accent sm:text-sm";

export default function CarouselStudio({ movies }) {
  const [mode, setMode] = useState("single");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(movies[0]?.id || "");
  const selectedMeta = movies.find((movie) => movie.id === selectedId) || movies[0] || null;
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [concept, setConcept] = useState("");
  const [conceptCarousel, setConceptCarousel] = useState(null);
  const [conceptBusy, setConceptBusy] = useState(false);
  const [cards, setCards] = useState([]);
  const [activeCard, setActiveCard] = useState(0);
  const [building, setBuilding] = useState(false);
  const [message, setMessage] = useState("");
  const blobs = useRef([]);
  const detailRequest = useRef(0);

  const singleCarousel = useMemo(
    () => selectedMovie ? buildSingleMovieCarousel(selectedMovie) : null,
    [selectedMovie],
  );
  const carousel = mode === "single" ? singleCarousel : conceptCarousel;
  const filteredMovies = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("ko");
    if (!term) return movies.slice(0, 8);
    return movies.filter((movie) => `${movie.title} ${movie.originalTitle} ${movie.director} ${movie.year}`.toLocaleLowerCase("ko").includes(term)).slice(0, 8);
  }, [movies, query]);

  useEffect(() => {
    if (!carousel) {
      setCards((current) => { current.forEach((card) => URL.revokeObjectURL(card.url)); return []; });
      blobs.current = [];
      return;
    }
    let alive = true;
    const timer = setTimeout(async () => {
      setBuilding(true);
      setMessage("");
      const previous = cards;
      try {
        const made = await renderCarousel(carousel);
        if (!alive) { made.forEach((card) => URL.revokeObjectURL(card.url)); return; }
        previous.forEach((card) => URL.revokeObjectURL(card.url));
        setCards(made);
        blobs.current = made.map((card) => card.blob);
        setActiveCard(0);
      } catch {
        if (alive) setMessage("카드를 만들지 못했습니다. 포스터 연결을 확인해 주세요.");
      } finally {
        if (alive) setBuilding(false);
      }
    }, 220);
    return () => { alive = false; clearTimeout(timer); };
    // cards is deliberately replaced only after a complete render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carousel]);

  useEffect(() => () => cards.forEach((card) => URL.revokeObjectURL(card.url)), [cards]);

  useEffect(() => {
    if (!selectedMeta?.slug) return;
    const requestId = ++detailRequest.current;
    let alive = true;
    setSelectedMovie(null);
    setDetailBusy(true);
    setDetailError("");
    adminApi("movieCarouselDetail", { slug: selectedMeta.slug })
      .then(({ movie }) => {
        if (!alive || requestId !== detailRequest.current) return;
        setSelectedMovie(movie);
      })
      .catch((error) => {
        if (!alive || requestId !== detailRequest.current) return;
        setDetailError(`영화 원문을 불러오지 못했습니다. ${error.message}`);
      })
      .finally(() => {
        if (alive && requestId === detailRequest.current) setDetailBusy(false);
      });
    return () => { alive = false; };
  }, [selectedMeta?.slug]);

  const pickMovie = (movie) => {
    setSelectedMovie(null);
    setDetailError("");
    setSelectedId(movie.id);
    setQuery(movie.title);
  };
  const buildConcept = async () => {
    setConceptBusy(true);
    setMessage("");
    try {
      const { carousel: next } = await adminApi("movieCarouselCuration", { concept });
      setConceptCarousel(next);
    } catch (error) {
      setConceptCarousel(null);
      setMessage(error.message);
    } finally {
      setConceptBusy(false);
    }
  };

  return (
    <div className="min-w-0 max-w-6xl">
      <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-line bg-surface p-1.5" aria-label="캐러셀 제작 방식">
        {[
          ["single", "한 편 깊이 보기", "기본 · 원문 분량에 따라 3~5장"],
          ["concept", "주제별 큐레이션", "보조 · 콘셉트로 여러 편 자동 선정"],
        ].map(([id, label, description]) => (
          <button key={id} type="button" onClick={() => setMode(id)} aria-label={label} aria-pressed={mode === id} className={`min-w-0 rounded-xl px-2 py-3 text-left transition sm:px-4 ${mode === id ? "bg-bg shadow-sm ring-1 ring-accent/40" : "text-muted hover:text-ink"}`}>
            <span className="block truncate text-sm font-semibold">{label}</span>
            <span className="mt-0.5 hidden text-xs text-muted sm:block">{description}</span>
          </button>
        ))}
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(340px,1.1fr)]">
        <section className="min-w-0 space-y-5" aria-label="캐러셀 영화 선택">
          {mode === "single" ? (
            <>
              <div>
                <label className="mb-2 block text-sm font-semibold">1. 영화 한 편 선택</label>
                <input aria-label="영화 검색" className={inputClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목·감독·연도로 검색" />
                <div className="mt-2 grid max-h-56 gap-1 overflow-y-auto rounded-xl border border-line p-1">
                  {filteredMovies.map((movie) => (
                    <button key={movie.id} type="button" onClick={() => pickMovie(movie)} className={`flex min-w-0 items-center gap-3 rounded-lg px-2 py-2 text-left ${movie.id === selectedId ? "bg-accent/10 text-accent" : "hover:bg-surface"}`}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{movie.title}</span>
                        <span className="block truncate text-xs text-muted">{[movie.director, movie.year].filter(Boolean).join(" · ")}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-line bg-surface px-4 py-4 text-sm leading-relaxed" aria-live="polite">
                <h2 className="font-semibold">2. 원문 자동 구성</h2>
                {detailBusy ? (
                  <p className="mt-2 text-accent">저장된 총평과 본문을 불러오는 중…</p>
                ) : detailError ? (
                  <p className="mt-2 text-red-400">{detailError}</p>
                ) : singleCarousel ? (
                  <>
                    <p className="mt-2 text-ink">총 {singleCarousel.slides.length}장 · 표지 1장 · 총평 1장 · 본문 {Math.max(0, singleCarousel.slides.length - 2)}장</p>
                    <p className="mt-1 text-xs text-muted">
                      저장된 문단을 순서대로 균등 분배했습니다. 문구를 새로 만들거나 원문을 수정하지 않습니다.
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-muted">영화를 선택해 주세요.</p>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold">키워드 또는 발행 콘셉트</label>
                <textarea className={`${inputClass} min-h-24`} value={concept} onChange={(event) => setConcept(event.target.value)} placeholder="예: 기억과 사랑 / 2000년대 한국 스릴러 / 비 오는 날 다시 보고 싶은 영화" />
                <button type="button" onClick={buildConcept} disabled={!concept.trim() || conceptBusy} className="mt-2 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-bg disabled:opacity-40">
                  {conceptBusy ? "영화 고르는 중…" : "콘셉트에 맞는 영화 자동 선택"}
                </button>
              </div>
              {conceptCarousel && (
                <div className="rounded-xl border border-line bg-surface p-4">
                  <p className="text-sm font-semibold">{conceptCarousel.headline}</p>
                  <p className="mt-1 text-xs text-muted">후보 {conceptCarousel.total}편 중 {conceptCarousel.selectedCount}편 선정{conceptCarousel.omittedCount ? ` · 외 ${conceptCarousel.omittedCount}편` : ""}</p>
                  <ol className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted sm:grid-cols-3">
                    {conceptCarousel.movies.map((movie, index) => <li key={movie.id} className="truncate">{index + 1}. {movie.title}</li>)}
                  </ol>
                </div>
              )}
              <p className="rounded-xl border border-line px-3 py-3 text-xs leading-relaxed text-muted">
                제목·감독·국가·장르·연도·태그·정서 주제·기존 감상문을 함께 비교합니다. 자동 선정 결과가 주제와 맞는지 확인한 뒤 저장하세요.
              </p>
            </div>
          )}
        </section>

        <section className="min-w-0 lg:sticky lg:top-4 lg:self-start" aria-label="캐러셀 미리보기와 저장">
          <div className="min-w-0 rounded-2xl border border-line bg-surface p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">{carousel?.headline || "캐러셀 미리보기"}</h2>
                <p className="text-xs text-muted">1080 × 1350 · {carousel?.slides.length || 0}장</p>
              </div>
              {building && <span className="shrink-0 text-xs text-accent">다시 그리는 중…</span>}
            </div>
            {cards.length ? (
              <>
                <img src={cards[activeCard]?.url} alt={`${activeCard + 1}번째 카드 — ${cards[activeCard]?.label}`} draggable={false} className="mx-auto max-h-[58dvh] w-auto max-w-full rounded-xl border border-line shadow-xl lg:max-h-[68vh]" />
                <ol className="mt-3 grid min-w-0 gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))` }}>
                  {cards.map((card, index) => (
                    <li key={`${card.role}-${index}`} className="min-w-0">
                      <button type="button" onClick={() => setActiveCard(index)} aria-label={`${index + 1}번째 카드 보기`} aria-pressed={activeCard === index} className={`w-full min-w-0 rounded-lg border p-1 ${activeCard === index ? "border-accent bg-accent/10" : "border-line opacity-65"}`}>
                        <img src={card.url} alt="" className="aspect-[4/5] w-full rounded object-cover" />
                        <span className="mt-1 block truncate text-[10px] text-muted">{index + 1}. {card.label}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <div className="flex aspect-[4/5] max-h-[58dvh] items-center justify-center rounded-xl border border-dashed border-line px-6 text-center text-sm text-muted">
                {building ? "포스터와 카드 생성 중…" : mode === "concept" ? "콘셉트를 입력해 영화를 자동 선택하세요." : "영화를 선택해 주세요."}
              </div>
            )}
            <button type="button" disabled={building || !carousel || cards.length !== carousel.slides.length} onClick={async () => {
              const result = await downloadAll(blobs.current, carousel);
              if (result === "shared") setMessage(`공유 시트로 ${cards.length}장을 전달했습니다.`);
              if (result === "downloaded") setMessage(`01부터 ${String(cards.length).padStart(2, "0")}까지 순서대로 저장했습니다.`);
            }} className="mt-4 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-bg disabled:opacity-40">
              {building ? "만드는 중…" : `PNG ${cards.length || carousel?.slides.length || 0}장 저장`}
            </button>
            <p className="mt-2 min-h-5 text-xs text-muted" aria-live="polite">{message}</p>
            {carousel && <Caption carousel={carousel} />}
          </div>
        </section>
      </div>
    </div>
  );
}

function Caption({ carousel }) {
  const text = buildMovieCarouselCaption(carousel);
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted">인스타그램 캡션</span>
        <button type="button" onClick={async () => {
          try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
        }} className="text-xs text-accent hover:underline">{copied ? "복사됨 ✓" : "복사"}</button>
      </div>
      <pre className="max-w-full whitespace-pre-wrap break-words rounded-lg border border-line bg-bg px-3 py-2 font-sans text-xs leading-relaxed">{text}</pre>
    </div>
  );
}
