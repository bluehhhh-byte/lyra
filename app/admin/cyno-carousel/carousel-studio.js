"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AdminErrorMessage from "../error-message";
import InstagramCaptionPreview from "../../caption-preview";
import { carouselDownloadEntries, waitForCarouselFonts } from "../../../lib/carousel";
import { buildMovieCarouselCaption } from "../../../lib/caption";
import { buildSingleMovieCarousel, buildSingleMovieDraft, coverKeywords, MOVIE_CAROUSEL_FONT_FACES } from "../../../lib/movie-carousel";
import {
  drawArtWash,
  drawImageCover,
  drawPageNumber,
  drawProgress,
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

const proxiedImage = (url) =>
  /^https:\/\/image\.tmdb\.org\/t\/p\//.test(url || "") ? `/api/img?url=${encodeURIComponent(url)}` : url;

const imagePromiseCache = new Map();

function cachedImage(url) {
  if (!url) return Promise.resolve(null);
  const src = proxiedImage(url);
  if (!imagePromiseCache.has(src)) {
    imagePromiseCache.set(src, loadImage(src).catch(() => null));
  }
  return imagePromiseCache.get(src);
}

async function loadMovieImages(movies) {
  const unique = [...new Map(movies.map((movie) => [movie.id, movie])).values()];
  const images = new Map();
  let cursor = 0;
  async function worker() {
    while (cursor < unique.length) {
      const movie = unique[cursor++];
      const [poster, backdrop] = await Promise.all([
        cachedImage(movie.poster),
        cachedImage(movie.backdrop),
      ]);
      images.set(movie.id, { poster, backdrop });
    }
  }
  await Promise.all(Array.from({ length: Math.min(POSTER_CONCURRENCY, unique.length) }, worker));
  return images;
}

const posterOf = (images, movie) => images.get(movie?.id)?.poster || null;
const backdropOf = (images, movie) => images.get(movie?.id)?.backdrop || posterOf(images, movie);

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

function roundedScene(ctx, image, x, y, width, height, focalX = 0.5, radius = 18) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = Math.max(0, Math.min(image.width - sourceWidth, (image.width - sourceWidth) * focalX));
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.clip();
  ctx.drawImage(image, sourceX, (image.height - sourceHeight) / 2, sourceWidth, sourceHeight, x, y, width, height);
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
  const image = posterOf(images, movie);
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

function header(ctx, label, position) {
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = `600 34px ${SERIF}`;
  ctx.fillText("Cyno.", PAD, 98);
  ctx.fillStyle = ACCENT;
  ctx.font = `700 23px ${SANS}`;
  ctx.fillText(label.toUpperCase(), PAD, 142);
  drawPageNumber(ctx, position, TOTAL_SLIDES);
}

function drawFittedParagraph(ctx, text, x, y, width, maxHeight, startSize = 46, minSize = 27, color = INK) {
  let size = startSize;
  let lines = [];
  for (; size >= minSize; size -= 2) {
    ctx.font = `500 ${size}px ${SANS}`;
    lines = wrap(ctx, text || "기록된 설명이 없습니다.", width);
    if (lines.length * (size * 1.55) <= maxHeight) break;
  }
  const visibleCount = Math.max(1, Math.floor(maxHeight / (size * 1.55)));
  const overflow = lines.length > visibleCount;
  const visible = lines.slice(0, visibleCount);
  if (overflow && visible.length) {
    let lastLine = visible.at(-1);
    while (lastLine && ctx.measureText(`${lastLine}…`).width > width) lastLine = lastLine.slice(0, -1).trimEnd();
    visible[visible.length - 1] = `${lastLine}…`;
  }
  ctx.fillStyle = color;
  ctx.font = `500 ${size}px ${SANS}`;
  visible.forEach((line, index) => ctx.fillText(line, x, y + index * size * 1.55));
  return overflow;
}

async function drawSingle(slide, images, position, carousel) {
  const { canvas, ctx } = canvas2d();
  const movie = slide.movie;
  const poster = posterOf(images, movie);
  const backdrop = backdropOf(images, movie);
  let overflow = false;
  base(ctx, slide.role === "cover" ? poster : backdrop, slide.role === "cover" ? 0.62 : 0.88);

  if (slide.role === "cover") {
    drawPoster(ctx, movie, images, 520, 130, 430, 645, 28);
    const fade = ctx.createLinearGradient(0, 640, 0, 1010);
    fade.addColorStop(0, "rgba(13,13,15,0)");
    fade.addColorStop(0.7, "rgba(13,13,15,0.94)");
    fade.addColorStop(1, BG);
    ctx.fillStyle = fade;
    ctx.fillRect(0, 580, W, 500);
    ctx.fillStyle = INK;
    ctx.font = `800 74px ${SANS}`;
    const headlineLines = wrap(ctx, carousel.headline, 820).slice(0, 2);
    headlineLines.forEach((line, index) => ctx.fillText(line, PAD, 800 + index * 88));
    let cursor = 800 + (headlineLines.length - 1) * 88;
    // 원제 — 한글 제목 아래에 원어(영어·일어·불어…) 제목을 병기한다.
    // 데이터 모델이 title=원제, title_ko=한글이라 원제가 한글과 같은 한국 영화는
    // 자연히 생략된다.
    if (movie.originalTitle && movie.originalTitle !== movie.title) {
      cursor += 52;
      ctx.fillStyle = DIM;
      ctx.font = `italic 500 31px ${SERIF}`;
      ctx.fillText(fitText(ctx, movie.originalTitle, 820), PAD, cursor);
    }
    // 별점 — 내가 준 별점이 있는 작품만. 없는 41편에서는 줄 자체가 사라진다.
    if (movie.rating != null) {
      cursor += 52;
      ctx.fillStyle = ACCENT;
      ctx.font = `700 30px ${SANS}`;
      ctx.fillText(`★ ${movie.rating.toFixed(1)}`, PAD, cursor);
    }
    // 메타 — 국가 · 연도 · 감독(공식명 + 한글 독음). 아이브로 문구 대신 작품 정보가 말한다.
    ctx.fillStyle = DIM;
    ctx.font = `500 29px ${SANS}`;
    ctx.fillText([movie.country, movie.year, movie.director].filter(Boolean).join(" · "), PAD, Math.max(1110, cursor + 78));
    // 하단 — 이 영화의 핵심 키워드 해시태그. Lyra 커버의 keywords·emotion과 같은 문법이다.
    // 워드마크 폭을 빼고 재서 한 줄에 들어갈 만큼만 싣는다 — 넘치면 거기서 끊는다.
    ctx.font = `500 27px ${SANS}`;
    const markWidth = (() => {
      ctx.save();
      ctx.font = `600 34px ${SERIF}`;
      const width = ctx.measureText("Cyno.").width;
      ctx.restore();
      return width;
    })();
    const room = W - PAD * 2 - markWidth - 32;
    let tagLine = "";
    for (const word of coverKeywords(movie)) {
      const next = tagLine ? `${tagLine} #${word}` : `#${word}`;
      if (ctx.measureText(next).width > room) break;
      tagLine = next;
    }
    if (tagLine) {
      ctx.fillStyle = "rgba(247,247,248,0.55)";
      ctx.fillText(tagLine, PAD, H - 74);
    }
    ctx.textAlign = "right";
    ctx.fillStyle = INK;
    ctx.font = `600 34px ${SERIF}`;
    ctx.fillText("Cyno.", W - PAD, H - 74);
    ctx.textAlign = "left";
  } else if (slide.role === "basic") {
    header(ctx, "FILM AT A GLANCE · 작품 개요", position);
    drawPoster(ctx, movie, images, PAD, 205, 330, 495, 22);
    const facts = [
      ["DIRECTOR", movie.director],
      ["YEAR", movie.year],
      ["RUNTIME", movie.runtime && `${movie.runtime}분`],
      ["GENRE", movie.genre],
      ["CAST", movie.cast],
    ].filter(([, value]) => value);
    facts.forEach(([label, value], index) => {
      const y = 238 + index * 94;
      ctx.fillStyle = ACCENT;
      ctx.font = `700 20px ${SANS}`;
      ctx.fillText(label, 458, y);
      ctx.fillStyle = INK;
      ctx.font = `600 30px ${SANS}`;
      wrap(ctx, value, 520).slice(0, 2).forEach((line, lineIndex) => ctx.fillText(line, 458, y + 38 + lineIndex * 34));
    });
    ctx.fillStyle = "rgba(13,13,15,0.78)";
    ctx.beginPath(); ctx.roundRect(PAD, 770, W - PAD * 2, 420, 26); ctx.fill();
    overflow = drawFittedParagraph(ctx, slide.text, PAD + 44, 840, W - PAD * 2 - 88, 300, 45, 30) || overflow;
  } else if (slide.role === "synopsis") {
    header(ctx, "STORY · 줄거리 요약", position);
    if (backdrop) roundedPoster(ctx, backdrop, PAD, 190, W - PAD * 2, 430, 28);
    const sceneFade = ctx.createLinearGradient(0, 370, 0, 640);
    sceneFade.addColorStop(0, "rgba(13,13,15,0)");
    sceneFade.addColorStop(1, BG);
    ctx.fillStyle = sceneFade;
    ctx.fillRect(PAD, 360, W - PAD * 2, 290);
    ctx.fillStyle = ACCENT;
    ctx.font = `800 30px ${SANS}`;
    ctx.fillText(movie.title, PAD + 42, 570);
    ctx.fillStyle = "rgba(13,13,15,0.84)";
    ctx.beginPath(); ctx.roundRect(PAD, 610, W - PAD * 2, 575, 28); ctx.fill();
    overflow = drawFittedParagraph(ctx, slide.text, PAD + 48, 680, W - PAD * 2 - 96, 430, 47, 30) || overflow;
  } else if (slide.role === "key-points") {
    header(ctx, "STORY AXIS · 핵심 내용", position);
    ctx.fillStyle = INK;
    ctx.font = `800 64px ${SANS}`;
    ctx.fillText("이야기의 중심", PAD, 245);
    const points = slide.points?.length ? slide.points : ["인물과 사건이 움직이는 장면을 따라가 보세요."];
    ctx.strokeStyle = "rgba(200,182,255,0.42)";
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(PAD + 34, 330); ctx.lineTo(PAD + 34, 970); ctx.stroke();
    points.slice(0, 3).forEach((point, index) => {
      const y = 355 + index * 230;
      ctx.fillStyle = ACCENT;
      ctx.beginPath(); ctx.arc(PAD + 34, y, 18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(13,13,15,0.76)";
      ctx.beginPath(); ctx.roundRect(PAD + 78, y - 62, W - PAD * 2 - 78, 190, 24); ctx.fill();
      ctx.fillStyle = ACCENT;
      ctx.font = `800 25px ${SANS}`;
      ctx.fillText(`SCENE ${String(index + 1).padStart(2, "0")}`, PAD + 112, y - 18);
      ctx.fillStyle = INK;
      overflow = drawFittedParagraph(ctx, point, PAD + 112, y + 25, W - PAD * 2 - 150, 100, 40, 30) || overflow;
    });
    if (slide.note) {
      ctx.fillStyle = DIM;
      ctx.font = `500 28px ${SANS}`;
      const note = wrap(ctx, `“${slide.note}”`, W - PAD * 2).slice(0, 3);
      note.forEach((line, index) => ctx.fillText(line, PAD, 1080 + index * 40));
    }
  } else {
    header(ctx, "FRAME NOTES · 감상 포인트", position);
    ctx.fillStyle = INK;
    ctx.font = `800 64px ${SANS}`;
    ctx.fillText("이 영화를 볼 때", PAD, 245);
    const points = slide.points?.length ? slide.points : ["장면의 분위기와 이야기의 리듬을 살펴보세요."];
    points.slice(0, 3).forEach((point, index) => {
      const y = 305 + index * 255;
      ctx.fillStyle = "rgba(13,13,15,0.82)";
      ctx.beginPath(); ctx.roundRect(PAD, y, W - PAD * 2, 220, 24); ctx.fill();
      if (backdrop) roundedScene(ctx, backdrop, PAD + 12, y + 12, 260, 196, [0.18, 0.5, 0.82][index], 16);
      ctx.fillStyle = ACCENT;
      ctx.font = `800 22px ${SANS}`;
      ctx.fillText(`LOOK ${String(index + 1).padStart(2, "0")}`, PAD + 304, y + 48);
      ctx.fillStyle = INK;
      overflow = drawFittedParagraph(ctx, point, PAD + 304, y + 92, W - PAD * 2 - 334, 105, 38, 29) || overflow;
    });
    if (slide.note) {
      ctx.fillStyle = DIM;
      ctx.font = `500 27px ${SANS}`;
      const note = wrap(ctx, `“${slide.note}”`, W - PAD * 2).slice(0, 2);
      note.forEach((line, index) => ctx.fillText(line, PAD, 1120 + index * 38));
    }
  }
  drawProgress(ctx, position, TOTAL_SLIDES);
  return { blob: await toBlob(canvas), overflow };
}

async function drawCurationCover(slide, images, carousel) {
  const { canvas, ctx } = canvas2d();
  const lead = backdropOf(images, slide.movies[0]);
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
  base(ctx, backdropOf(images, movie), 0.82);
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

const carouselMovies = (carousel) =>
  carousel.slides.flatMap((slide) => slide.movies || (slide.movie ? [slide.movie] : []));

async function loadCarouselImages(carousel) {
  const [, images] = await Promise.all([
    waitForCarouselFonts(undefined, MOVIE_CAROUSEL_FONT_FACES),
    loadMovieImages(carouselMovies(carousel)),
  ]);
  return images;
}

async function renderCarouselCard(carousel, index, images) {
  const slide = carousel.slides[index];
  const position = index + 1;
  let blob;
  let overflow = false;
  if (carousel.kind === "single") {
    const rendered = await drawSingle(slide, images, position, carousel);
    blob = rendered.blob;
    overflow = rendered.overflow;
  } else if (slide.role === "curation-cover") blob = await drawCurationCover(slide, images, carousel);
  else if (slide.role === "curation-list") blob = await drawCurationList(slide, images, position, carousel);
  else blob = await drawCurationNote(slide, images, position, carousel);
  return { ...slide, blob, overflow, url: URL.createObjectURL(blob) };
}

async function renderCarousel(carousel) {
  const images = await loadCarouselImages(carousel);
  const made = [];
  for (let index = 0; index < carousel.slides.length; index += 1)
    made.push(await renderCarouselCard(carousel, index, images));
  return made;
}

async function downloadAll(blobs, carousel) {
  const files = carouselDownloadEntries(blobs, carousel.id)
    .map(({ blob, name }) => new File([blob], name, { type: "image/png" }));
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
const enhancedCopyCache = new Map();

export default function CarouselStudio({ movies, initialMovieId = "", initialConcept = "", hashtagSets = [] }) {
  const initialMovie = movies.find((movie) => movie.id === initialMovieId) || movies[0] || null;
  const [mode, setMode] = useState(initialConcept ? "concept" : "single");
  const [query, setQuery] = useState(initialMovieId ? initialMovie?.title || "" : "");
  const [selectedId, setSelectedId] = useState(initialMovie?.id || "");
  const selectedMovie = movies.find((movie) => movie.id === selectedId) || movies[0] || null;
  const [draft, setDraft] = useState(() => selectedMovie ? buildSingleMovieDraft(selectedMovie) : null);
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyState, setCopyState] = useState("local");
  const [copyNotice, setCopyNotice] = useState("");
  const [concept, setConcept] = useState(initialConcept);
  const [conceptCarousel, setConceptCarousel] = useState(null);
  const [conceptBusy, setConceptBusy] = useState(false);
  const [cards, setCards] = useState([]);
  const [activeCard, setActiveCard] = useState(0);
  const [building, setBuilding] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const blobs = useRef([]);
  const cardsRef = useRef([]);
  const renderHint = useRef(null);
  const copyRequest = useRef(0);

  const singleCarousel = useMemo(
    () => selectedMovie && draft ? buildSingleMovieCarousel(selectedMovie, draft) : null,
    [selectedMovie, draft],
  );
  const carousel = mode === "single" ? singleCarousel : conceptCarousel;
  const overflowCount = cards.filter((card) => card.overflow).length;
  const filteredMovies = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("ko");
    if (!term) return movies.slice(0, 8);
    return movies.filter((movie) => `${movie.title} ${movie.originalTitle} ${movie.director} ${movie.year}`.toLocaleLowerCase("ko").includes(term)).slice(0, 8);
  }, [movies, query]);

  useEffect(() => {
    if (!carousel) {
      setCards((current) => { current.forEach((card) => URL.revokeObjectURL(card.url)); return []; });
      cardsRef.current = [];
      blobs.current = [];
      return;
    }
    let alive = true;
    const timer = setTimeout(async () => {
      setBuilding(true);
      setMessage("");
      setError("");
      const previous = cardsRef.current;
      const hintedIndex = renderHint.current;
      renderHint.current = null;
      const canRenderOne = mode === "single"
        && Number.isInteger(hintedIndex)
        && previous.length === TOTAL_SLIDES
        && previous[0]?.movie?.id === carousel.movie?.id;
      try {
        if (canRenderOne) {
          const images = await loadCarouselImages(carousel);
          const replacement = await renderCarouselCard(carousel, hintedIndex, images);
          if (!alive) { URL.revokeObjectURL(replacement.url); return; }
          const made = previous.map((card, index) => index === hintedIndex ? replacement : card);
          URL.revokeObjectURL(previous[hintedIndex].url);
          cardsRef.current = made;
          setCards(made);
          blobs.current = made.map((card) => card.blob);
        } else {
          const made = await renderCarousel(carousel);
          if (!alive) { made.forEach((card) => URL.revokeObjectURL(card.url)); return; }
          previous.forEach((card) => URL.revokeObjectURL(card.url));
          cardsRef.current = made;
          setCards(made);
          blobs.current = made.map((card) => card.blob);
          setActiveCard((current) => Math.min(current, made.length - 1));
        }
      } catch {
        if (alive) setError("카드를 만들지 못했습니다. 포스터·장면 이미지 연결을 확인해 주세요.");
      } finally {
        if (alive) setBuilding(false);
      }
    }, 220);
    return () => { alive = false; clearTimeout(timer); };
  }, [carousel, mode]);

  useEffect(() => () => cardsRef.current.forEach((card) => URL.revokeObjectURL(card.url)), []);

  useEffect(() => {
    // 테마 후보는 결정론적 큐레이션만 준비한다. 한 편용 AI 문구는 실제로
    // "한 편 깊이 보기"를 열었을 때만 요청한다.
    if (mode !== "single" || !selectedMovie) return;
    const requestId = ++copyRequest.current;
    let alive = true;
    setDraft(buildSingleMovieDraft(selectedMovie));
    const cached = enhancedCopyCache.get(selectedMovie.slug);
    if (cached) {
      setDraft((current) => ({ ...current, ...cached }));
      setCopyBusy(false);
      setCopyState("enhanced");
      setCopyNotice("");
      return () => { alive = false; };
    }
    setCopyBusy(true);
    setCopyState("loading");
    setCopyNotice("");
    adminApi("movieCarouselCopy", { slug: selectedMovie.slug })
      .then(({ draft: enhancedDraft, enhanced, warning }) => {
        if (!alive || requestId !== copyRequest.current) return;
        if (enhanced) {
          enhancedCopyCache.set(selectedMovie.slug, enhancedDraft);
          setDraft((current) => ({ ...current, ...enhancedDraft }));
        }
        setCopyState(enhanced ? "enhanced" : "fallback");
        setCopyNotice(warning || "");
      })
      .catch((error) => {
        if (!alive || requestId !== copyRequest.current) return;
        setCopyState("fallback");
        setCopyNotice(`AI 문구를 불러오지 못해 수정 가능한 기본 초안을 유지합니다. ${error.message}`);
      })
      .finally(() => {
        if (alive && requestId === copyRequest.current) setCopyBusy(false);
      });
    return () => { alive = false; };
  }, [mode, selectedMovie]);

  const pickMovie = (movie) => {
    renderHint.current = null;
    setSelectedId(movie.id);
    setQuery(movie.title);
    setActiveCard(0);
  };

  const updateDraft = (field, value) => {
    const slideByField = {
      headline: 0,
      basicDescription: 1,
      synopsis: 2,
      keyPoints: 3,
      keyPointsNote: 3,
      viewingPoints: 4,
      viewingPointsNote: 4,
    };
    renderHint.current = slideByField[field] ?? null;
    setDraft((current) => ({ ...current, [field]: value }));
  };
  const regenerateCopy = async () => {
    if (!selectedMovie || copyBusy) return;
    const requestId = ++copyRequest.current;
    setCopyBusy(true);
    setCopyState("loading");
    setCopyNotice("");
    try {
      const { draft: enhancedDraft, enhanced, warning } = await adminApi("movieCarouselCopy", { slug: selectedMovie.slug });
      if (requestId !== copyRequest.current) return;
      if (enhanced) {
        enhancedCopyCache.set(selectedMovie.slug, enhancedDraft);
        setDraft((current) => ({ ...current, ...enhancedDraft }));
        setCopyState("enhanced");
      } else {
        // 재생성 실패가 사용자가 직접 고친 문구를 덮어쓰면 안 된다.
        setCopyState("fallback");
        setCopyNotice(warning || "AI 생성에 실패해 현재 편집 문구를 유지합니다.");
      }
    } catch (error) {
      if (requestId !== copyRequest.current) return;
      setCopyState("fallback");
      setCopyNotice(`AI 생성에 실패해 현재 편집 문구를 유지합니다. ${error.message}`);
    } finally {
      if (requestId === copyRequest.current) setCopyBusy(false);
    }
  };
  const buildConcept = async () => {
    setConceptBusy(true);
    setMessage("");
    setError("");
    try {
      const { carousel: next } = await adminApi("movieCarouselCuration", { concept });
      setConceptCarousel(next);
    } catch (error) {
      setConceptCarousel(null);
      setError(error.message);
    } finally {
      setConceptBusy(false);
    }
  };

  return (
    <div className="min-w-0 max-w-6xl">
      <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-line bg-surface p-1.5" aria-label="캐러셀 제작 방식">
        {[
          ["single", "한 편 깊이 보기", "기본 · 영화 한 편을 5장으로"],
          ["concept", "주제별 큐레이션", "보조 · 콘셉트로 여러 편 자동 선정"],
        ].map(([id, label, description]) => (
          <button key={id} type="button" onClick={() => { renderHint.current = null; setActiveCard(0); setMode(id); }} aria-label={label} aria-pressed={mode === id} className={`min-w-0 rounded-xl px-2 py-3 text-left transition sm:px-4 ${mode === id ? "bg-bg shadow-sm ring-1 ring-accent/40" : "text-muted hover:text-ink"}`}>
            <span className="block truncate text-sm font-semibold">{label}</span>
            <span className="mt-0.5 hidden text-xs text-muted sm:block">{description}</span>
          </button>
        ))}
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(340px,1.1fr)]">
        <section className="min-w-0 space-y-5" aria-label="캐러셀 내용 편집">
          {mode === "single" ? (
            <>
              <div>
                <label className="mb-2 block text-sm font-semibold">1. 영화 한 편 선택</label>
                <input className={inputClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목·감독·연도로 검색" />
                <div className="mt-2 grid max-h-56 gap-1 overflow-y-auto rounded-xl border border-line p-1">
                  {filteredMovies.map((movie) => (
                    <button key={movie.id} type="button" onClick={() => pickMovie(movie)} className={`flex min-w-0 items-center gap-3 rounded-lg px-2 py-2 text-left ${movie.id === selectedMovie?.id ? "bg-accent/10 text-accent" : "hover:bg-surface"}`}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{movie.title}</span>
                        <span className="block truncate text-xs text-muted">{[movie.director, movie.year].filter(Boolean).join(" · ")}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              {draft && (
                <div className="space-y-4">
                  <h2 className="text-sm font-semibold">2. 자동 작성 문구 검수</h2>
                  <div className={`rounded-xl border px-3 py-3 text-xs leading-relaxed ${copyState === "enhanced" ? "border-accent/40 bg-accent/10" : "border-line bg-surface"}`} aria-live="polite">
                    <p className="font-semibold text-ink">
                      {copyBusy ? "작품별 문구를 깊게 작성하는 중…" : copyState === "enhanced" ? "작품별 AI 문구 고도화 완료" : "수정 가능한 기본 초안 사용 중"}
                    </p>
                    <p className="mt-1 text-muted">
                      {copyBusy
                        ? "줄거리·개인 감상·감독·배우·장르·주제를 함께 읽고 있습니다."
                        : copyState === "enhanced"
                          ? "구체적인 서사·갈등·감상 근거를 반영했습니다. 아래에서 자유롭게 수정할 수 있습니다."
                          : copyNotice || "AI를 사용할 수 없을 때도 저장된 기록으로 만든 초안을 편집할 수 있습니다."}
                    </p>
                    <button type="button" onClick={regenerateCopy} disabled={copyBusy} className="mt-2 rounded-lg border border-accent/40 px-3 py-1.5 font-semibold text-accent transition hover:bg-accent/10 disabled:opacity-40">
                      {copyBusy ? "고도화 중…" : "AI 문구 다시 생성"}
                    </button>
                  </div>
                  <Editor label="표지 제목" value={draft.headline} onChange={(value) => updateDraft("headline", value)} rows={1} />
                  <Editor label="작품 개요" value={draft.basicDescription} onChange={(value) => updateDraft("basicDescription", value)} rows={4} />
                  <Editor label="줄거리 요약 · 결말 제외" value={draft.synopsis} onChange={(value) => updateDraft("synopsis", value)} rows={7} />
                  <Editor label="핵심 내용 · 서사 구조 / 갈등 / 주제" value={draft.keyPoints.join("\n")} onChange={(value) => updateDraft("keyPoints", value.split("\n"))} rows={6} />
                  <Editor label="감상 포인트 · 장르 / 국가 / 연도의 맥락" value={draft.viewingPoints.join("\n")} onChange={(value) => updateDraft("viewingPoints", value.split("\n"))} rows={6} />
                  <Editor label="핵심 내용 요약 한 문장 (4장 하단 인용문)" value={draft.keyPointsNote} onChange={(value) => updateDraft("keyPointsNote", value)} rows={2} />
                  <Editor label="감상 포인트 요약 한 문장 (5장 하단 인용문)" value={draft.viewingPointsNote} onChange={(value) => updateDraft("viewingPointsNote", value)} rows={2} />
                </div>
              )}
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
                <p className="text-xs text-muted">1080 × 1350 · 5장</p>
              </div>
              {building && <span className="shrink-0 text-xs text-accent">다시 그리는 중…</span>}
            </div>
            {overflowCount > 0 && (
              <p className="mb-3 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-200" role="status">
                {overflowCount}개 카드의 긴 문장을 말줄임표로 축약했습니다. 해당 카드의 문구를 조금 줄여 주세요.
              </p>
            )}
            {cards.length ? (
              <>
                <div className="relative mx-auto w-fit max-w-full">
                  <img src={cards[activeCard]?.url} alt={`${activeCard + 1}번째 카드 — ${cards[activeCard]?.label}`} draggable={false} className="max-h-[58dvh] w-auto max-w-full rounded-xl border border-line shadow-xl lg:max-h-[68vh]" />
                  {cards[activeCard]?.overflow && <span className="absolute right-2 top-2 rounded-full bg-amber-300 px-2 py-1 text-[10px] font-bold text-black">문구 축약됨</span>}
                </div>
                <ol className="mt-3 grid min-w-0 grid-cols-5 gap-1.5 sm:gap-2">
                  {cards.map((card, index) => (
                    <li key={`${card.role}-${index}`} className="min-w-0">
                      <button type="button" onClick={() => setActiveCard(index)} aria-label={`${index + 1}번째 카드 보기`} aria-pressed={activeCard === index} className={`w-full min-w-0 rounded-lg border p-1 ${activeCard === index ? "border-accent bg-accent/10" : "border-line opacity-65"}`}>
                        <img src={card.url} alt="" className="aspect-[4/5] w-full rounded object-cover" />
                        <span className={`mt-1 block truncate text-[10px] ${card.overflow ? "text-amber-300" : "text-muted"}`}>{index + 1}. {card.label}{card.overflow ? " · 축약" : ""}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <div className="flex aspect-[4/5] max-h-[58dvh] items-center justify-center rounded-xl border border-dashed border-line px-6 text-center text-sm text-muted">
                {building ? "포스터·장면 이미지와 카드 생성 중…" : mode === "concept" ? "콘셉트를 입력해 영화를 자동 선택하세요." : "영화를 선택해 주세요."}
              </div>
            )}
            <button type="button" disabled={building || cards.length !== TOTAL_SLIDES} onClick={async () => {
              setError("");
              const result = await downloadAll(blobs.current, carousel);
              if (result === "shared") setMessage("공유 시트로 5장을 전달했습니다.");
              if (result === "downloaded") setMessage("01부터 05까지 순서대로 저장했습니다.");
            }} className="mt-4 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-bg disabled:opacity-40">
              {building ? "만드는 중…" : "PNG 5장 저장"}
            </button>
            <p className="mt-2 min-h-5 text-xs text-muted" aria-live="polite">{message}</p>
            <AdminErrorMessage message={error} className="mt-2" />
            {carousel && <Caption carousel={carousel} hashtagSets={hashtagSets} />}
          </div>
        </section>
      </div>
    </div>
  );
}

function Editor({ label, value, onChange, rows = 3 }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-muted">{label}</span>
      <textarea aria-label={label} className={inputClass} rows={rows} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Caption({ carousel, hashtagSets }) {
  const [setId, setSetId] = useState(hashtagSets[0]?.id || "");
  const selectedSet = hashtagSets.find((set) => set.id === setId);
  const text = buildMovieCarouselCaption(carousel, new Date(), selectedSet?.tags || []);
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted">인스타그램 캡션</span>
        <button type="button" onClick={async () => {
          try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
        }} className="text-xs text-accent hover:underline">{copied ? "복사됨 ✓" : "복사"}</button>
      </div>
      {hashtagSets.length > 0 && (
        <label className="mb-2 block text-xs text-muted">
          해시태그 세트
          <select value={setId} onChange={(event) => setSetId(event.target.value)} className="ml-2 rounded-md border border-line bg-bg px-2 py-1 text-xs text-ink">
            {hashtagSets.map((set) => <option key={set.id} value={set.id}>{set.label}</option>)}
          </select>
        </label>
      )}
      <InstagramCaptionPreview text={text} className="bg-bg" />
    </div>
  );
}
