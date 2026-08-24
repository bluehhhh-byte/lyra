export const MOVIE_CAROUSEL_SLIDES = 5;
export const MOVIES_PER_SLIDE = 6;
export const MOVIE_CAROUSEL_LIMIT = 18;

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const titleOf = (movie) => clean(movie.title_ko || movie.title) || "제목 없음";
const directorOf = (movie) => clean(movie.director_ko || movie.director);
const numericRating = (movie) => Number(movie.rating ?? -1);
const numericYear = (movie) => Number(movie.year || 0);

function paragraphs(movie) {
  const value = Array.isArray(movie.synopsis) ? movie.synopsis : [movie.synopsis];
  return value.map(clean).filter(Boolean);
}

export function carouselMovie(movie) {
  const synopsis = paragraphs(movie);
  return {
    id: String(movie.slug || movie.code || movie.tmdbId || `${titleOf(movie)}-${movie.year || ""}`),
    slug: clean(movie.slug),
    media: movie.media === "tv" ? "tv" : "movie",
    title: titleOf(movie),
    originalTitle: clean(movie.title),
    director: directorOf(movie),
    cast: clean(movie.cast),
    year: clean(movie.year),
    runtime: clean(movie.runtime),
    genre: clean(movie.genre),
    country: clean(movie.country || movie.tags?.[0]),
    rating: movie.rating != null && movie.rating !== "" && Number.isFinite(Number(movie.rating)) ? Number(movie.rating) : null,
    poster: clean(movie.poster),
    backdrop: clean(movie.backdrop),
    tags: (movie.tags || []).map(clean).filter(Boolean),
    themes: (movie.themes || []).map(clean).filter(Boolean),
    synopsis,
    comment: clean(movie.comment),
    bodyKind: clean(movie.body_kind),
    tmdbId: movie.tmdbId || null,
  };
}

// Lyra 가사 캐러셀의 splitLines와 같은 분배 규칙이다. 원문 문단 순서를
// 보존하고 앞 조각이 뒤 조각보다 작지 않게 나눈다. 문단이 부족하면 빈
// 카드를 만들지 않고 본문 카드 수 자체를 줄인다.
export function splitMovieParagraphs(values, parts = 3) {
  const items = (Array.isArray(values) ? values : [values]).map(clean).filter(Boolean);
  const count = Math.min(parts, items.length);
  if (!count) return [];
  const chunks = [];
  let start = 0;
  for (let index = 0; index < count; index++) {
    const size = Math.ceil((items.length - start) / (count - index));
    chunks.push(items.slice(start, start + size));
    start += size;
  }
  return chunks;
}

export function buildSingleMovieCarousel(input) {
  const movie = carouselMovie(input);
  const chunks = splitMovieParagraphs(movie.synopsis);
  const bodyLabel = movie.bodyKind === "review" ? "작품 노트" : "줄거리";
  return {
    id: `movie-${movie.slug || movie.id}`,
    kind: "single",
    label: movie.title,
    headline: movie.title,
    movie,
    slides: [
      { role: "cover", label: "표지", movie },
      { role: "about", label: "총평", movie, text: movie.comment },
      ...chunks.map((chunk, index) => ({
        role: "body",
        label: `${bodyLabel} ${index + 1}/${chunks.length}`,
        movie,
        paragraphs: chunk,
        part: index + 1,
        parts: chunks.length,
        bodyLabel,
      })),
    ],
  };
}

export function sortCarouselMovies(movies) {
  return [...movies].sort(
    (a, b) =>
      numericRating(b) - numericRating(a) ||
      numericYear(b) - numericYear(a) ||
      titleOf(a).localeCompare(titleOf(b), "ko"),
  );
}

export function gridForCount(count) {
  if (count <= 1) return { columns: 1, rows: Math.max(0, count) };
  if (count <= 2) return { columns: 2, rows: 1 };
  if (count <= 4) return { columns: 2, rows: 2 };
  return { columns: 3, rows: 2 };
}

function movieKeys(movie) {
  const keys = [];
  if (movie.tmdbId) keys.push(`tmdb:${movie.tmdbId}`);
  const year = numericYear(movie);
  for (const title of [movie.title_ko, movie.title].filter(Boolean)) keys.push(`title:${clean(title).toLowerCase()}|${year}`);
  return keys;
}

export function mergeCurationMovies(watched, reviews = []) {
  const index = new Map();
  for (const review of reviews) for (const key of movieKeys(review)) if (!index.has(key)) index.set(key, review);
  return watched.map((watchedMovie) => {
    const review = movieKeys(watchedMovie).map((key) => index.get(key)).find(Boolean);
    return carouselMovie({ ...watchedMovie, ...(review || {}), rating: watchedMovie.rating ?? review?.rating });
  });
}

function conceptTerms(concept) {
  const stopWords = new Set(["영화", "작품", "별점", "추천", "다시", "보고", "싶은", "고른", "대한", "있는", "없는", "하는"]);
  return clean(concept)
    .toLocaleLowerCase("ko")
    .split(/[\s,/#·&+]+/)
    .map((term) => term.replace(/(?<=\d)점$/u, ""))
    .map((term) => term.length > 2 ? term.replace(/(에서|으로|에게|과|와|을|를|이|가|의|에|로)$/u, "") : term)
    .filter((term) => (term.length >= 2 || /^\d+$/.test(term)) && !stopWords.has(term));
}

export function scoreMovieForConcept(movie, concept) {
  const terms = conceptTerms(concept);
  if (!terms.length) return 0;
  const fields = [
    [movie.title, 8],
    [movie.originalTitle, 6],
    [movie.director, 5],
    [movie.country, 6],
    [movie.genre, 6],
    [movie.year, 5],
    [movie.rating, 3],
    [movie.tags.join(" "), 5],
    [movie.themes.join(" "), 8],
    [movie.comment, 3],
    [movie.synopsis.join(" "), 2],
  ];
  return terms.reduce((score, term) => score + fields.reduce((sum, [value, weight]) => sum + (String(value || "").toLocaleLowerCase("ko").includes(term) ? weight : 0), 0), 0);
}

function splitThree(items) {
  const groups = [[], [], []];
  items.forEach((item, index) => groups[Math.floor((index * 3) / Math.max(1, items.length))].push(item));
  return groups;
}

export function buildConceptCarousel(concept, watched, reviews = []) {
  const query = clean(concept);
  const ranked = mergeCurationMovies(watched, reviews)
    .map((movie) => ({ movie, score: scoreMovieForConcept(movie, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || numericRating(b.movie) - numericRating(a.movie) || numericYear(b.movie) - numericYear(a.movie));
  const selected = ranked.slice(0, MOVIE_CAROUSEL_LIMIT).map((item) => item.movie);
  const groups = splitThree(selected);
  const closingMovie = selected.find((movie) => movie.comment) || selected[0] || null;
  const safeId = query.toLocaleLowerCase("ko").replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "concept";
  return {
    id: `concept-${safeId}`,
    kind: "concept",
    label: query,
    headline: query ? `‘${query}’으로 고른 영화` : "주제를 입력해 주세요",
    total: ranked.length,
    selectedCount: selected.length,
    omittedCount: Math.max(0, ranked.length - selected.length),
    movies: selected,
    slides: [
      { role: "curation-cover", label: "표지", movies: selected.slice(0, 3) },
      ...groups.map((movies, index) => ({ role: "curation-list", label: `목록 ${index + 1}`, movies, grid: gridForCount(movies.length) })),
      { role: "curation-note", label: "선정 노트", movie: closingMovie, comment: closingMovie?.comment || `${query}이라는 키워드로 연결되는 작품들입니다.` },
    ],
  };
}
