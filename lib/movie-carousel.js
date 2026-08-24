export const MOVIE_CAROUSEL_SLIDES = 5;
export const MOVIES_PER_SLIDE = 6;
export const MOVIE_CAROUSEL_LIMIT = 18;

// 프리셋은 데이터로만 정의한다. 필터 종류와 문구를 추가해도 캔버스 렌더러는 바뀌지 않는다.
export const MOVIE_CAROUSEL_PRESETS = [
  { id: "five-stars", label: "★5를 준 영화", kind: "rating-eq", value: 5 },
  { id: "four-half-up", label: "★4.5 이상", kind: "rating-min", value: 4.5 },
  { id: "2000s", label: "2000년대에서 고른 것", kind: "decade", value: 2000 },
  { id: "korean-high", label: "한국 영화 중 높게 본 것", kind: "country", value: "한국" },
  { id: "japanese-high", label: "일본 영화 중 높게 본 것", kind: "country", value: "일본" },
];

const numericRating = (movie) => Number(movie.rating ?? -1);
const numericYear = (movie) => Number(movie.year || 0);

export function sortCarouselMovies(movies) {
  return [...movies].sort(
    (a, b) =>
      numericRating(b) - numericRating(a) ||
      numericYear(b) - numericYear(a) ||
      String(a.title_ko || a.title || "").localeCompare(String(b.title_ko || b.title || ""), "ko"),
  );
}

export function gridForCount(count) {
  if (count <= 1) return { columns: 1, rows: Math.max(0, count) };
  if (count <= 2) return { columns: 2, rows: 1 };
  if (count <= 4) return { columns: 2, rows: 2 };
  if (count <= 6) return { columns: 3, rows: 2 };
  return { columns: 3, rows: 3 };
}

function matchesPreset(movie, preset) {
  const rating = numericRating(movie);
  if (rating < 0) return false;
  if (preset.kind === "rating-eq") return rating === Number(preset.value);
  if (preset.kind === "rating-min") return rating >= Number(preset.value);
  if (preset.kind === "decade") {
    const year = numericYear(movie);
    return year >= Number(preset.value) && year < Number(preset.value) + 10;
  }
  if (preset.kind === "country") {
    return movie.country === preset.value || (movie.tags || []).includes(preset.value);
  }
  return false;
}

function movieKeys(movie) {
  const keys = [];
  if (movie.tmdbId) keys.push(`tmdb:${movie.tmdbId}`);
  const year = numericYear(movie);
  for (const title of [movie.title_ko, movie.title].filter(Boolean))
    keys.push(`title:${String(title).trim().toLowerCase()}|${year}`);
  return keys;
}

function reviewIndex(reviews) {
  const index = new Map();
  for (const review of reviews) for (const key of movieKeys(review)) if (!index.has(key)) index.set(key, review);
  return index;
}

function findReview(movie, index) {
  for (const key of movieKeys(movie)) if (index.has(key)) return index.get(key);
  return null;
}

function cardMovie(movie) {
  return {
    id: String(movie.code || movie.tmdbId || `${movie.title}-${movie.year}`),
    title: movie.title_ko || movie.title || "제목 없음",
    year: String(movie.year || ""),
    rating: Number(movie.rating),
    poster: movie.poster || "",
    director: movie.director_ko || movie.director || "",
  };
}

function coverCopy(preset, total) {
  if (preset.kind === "rating-eq") return `★${preset.value}를 준 ${total}편`;
  if (preset.kind === "rating-min") return `★${preset.value} 이상 ${total}편`;
  if (preset.kind === "decade") return `${preset.value}년대에서 고른 ${total}편`;
  if (preset.kind === "country") return `${preset.value} 영화 ${total}편 중 높은 별점`;
  return `${preset.label} · ${total}편`;
}

export function buildMovieCarouselPreset(preset, watched, reviews = []) {
  const candidates = sortCarouselMovies(watched.filter((movie) => matchesPreset(movie, preset)));
  const selectedRaw = candidates.slice(0, MOVIE_CAROUSEL_LIMIT);
  const selected = selectedRaw.map(cardMovie);
  const index = reviewIndex(reviews);
  let closing = null;
  for (let i = 0; i < selectedRaw.length; i++) {
    const review = findReview(selectedRaw[i], index);
    if (review?.comment) {
      closing = { movie: selected[i], comment: String(review.comment).trim() };
      break;
    }
  }

  const listSlides = [];
  for (let i = 0; i < selected.length; i += MOVIES_PER_SLIDE) {
    const movies = selected.slice(i, i + MOVIES_PER_SLIDE);
    listSlides.push({
      role: "list",
      label: `목록 ${listSlides.length + 1}`,
      movies,
      grid: gridForCount(movies.length),
      range: [i + 1, i + movies.length],
    });
  }

  const omittedCount = Math.max(0, candidates.length - selected.length);
  return {
    id: preset.id,
    label: preset.label,
    headline: coverCopy(preset, candidates.length),
    total: candidates.length,
    omittedCount,
    selectedCount: selected.length,
    closing,
    slides: [
      { role: "cover", label: "표지", movies: selected.slice(0, 9) },
      ...listSlides,
      { role: "closing", label: "맺음", ...closing },
    ],
  };
}

export function buildMovieCarouselCatalog(watched, reviews = [], presets = MOVIE_CAROUSEL_PRESETS) {
  return presets
    .map((preset) => buildMovieCarouselPreset(preset, watched, reviews))
    .filter((preset) => preset.closing && preset.slides.length === MOVIE_CAROUSEL_SLIDES);
}
