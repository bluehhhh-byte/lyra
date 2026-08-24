export const MOVIE_CAROUSEL_SLIDES = 5;
export const MOVIES_PER_SLIDE = 6;
export const MOVIE_CAROUSEL_LIMIT = 18;

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const titleOf = (movie) => clean(movie.title_ko || movie.title) || "제목 없음";
const hasHangul = (value) => /[가-힣]/.test(value || "");

// 인명 표기 — 공식명(원어)을 먼저, 옆에 한글 독음을 괄호로.
//   黒澤明 (구로사와 아키라) / Volker Schlöndorff (폴커 슐뢴도르프) / 봉준호
// 공식명이 이미 한글이면 괄호를 붙이지 않는다. 예전에는 독음을 우선해 공식명이
// 버려졌는데, 카드는 작품의 공식 표기를 보여주는 자리라 방향을 뒤집는다.
export function personLabel(official, ko) {
  const name = clean(official);
  const reading = clean(ko);
  if (!name) return reading;
  if (hasHangul(name) || !reading || reading === name || !hasHangul(reading)) return name;
  return `${name} (${reading})`;
}

const directorOf = (movie) => personLabel(movie.director, movie.director_ko);
const numericRating = (movie) => Number(movie.rating ?? -1);
const numericYear = (movie) => Number(movie.year || 0);

function sentences(value) {
  return clean(value)
    .split(/(?<=[.!?。！？])\s+/)
    .map(clean)
    .filter(Boolean);
}

function paragraphs(movie) {
  const value = Array.isArray(movie.synopsis) ? movie.synopsis : [movie.synopsis];
  return value.map(clean).filter(Boolean);
}

function shorten(value, max) {
  const text = clean(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, "")}…`;
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
    rating: Number.isFinite(Number(movie.rating)) ? Number(movie.rating) : null,
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

// 표지 하단 해시태그 — Lyra 커버의 keywords·emotion과 같은 문법.
// themes(전 영화 1~3개) → genre → country → tags 순으로 5개까지, 연도류는 뺀다.
export function coverKeywords(movie, limit = 5) {
  const seen = new Set();
  const out = [];
  for (const word of [...(movie.themes || []), movie.genre, movie.country, ...(movie.tags || [])]) {
    const value = clean(word);
    if (!value || seen.has(value)) continue;
    if (/^(19|20)\d{2}(년대?|s)?$/.test(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

export function buildSingleMovieDraft(input) {
  const movie = carouselMovie(input);
  const synopsisText = movie.synopsis.join(" ");
  const synopsisSentences = sentences(synopsisText);
  const themes = movie.themes.length ? movie.themes : movie.tags.filter((tag) => tag !== movie.genre && tag !== movie.year).slice(0, 3);
  const basicDescription = movie.comment || synopsisSentences[0] || `${movie.director ? `${movie.director}의 ` : ""}${movie.genre || "영화"} 작품.`;

  // "이야기의 중심"은 서사만 싣는다 — 줄거리 문장에서 인물·사건·전개를 따라간다.
  // 예전에는 문장이 모자라면 "○○이라는 주제가 …에 스며드는 방식" 같은 상투 문구로
  // 3개를 채웠는데, 그건 서사가 아니라 필러다. 모자라면 포인트 수를 줄인다.
  let keyPoints = synopsisSentences.slice(1, 4);
  if (!keyPoints.length && synopsisSentences[0]) keyPoints = [synopsisSentences[0]];

  // "이 영화를 볼 때"는 장르·국가·연도의 맥락으로 읽는다 — 감독·배우 나열이 아니라
  // 이 영화가 놓인 자리(어느 시대, 어느 나라, 어느 장르의 문법인가)를 짚는 카드다.
  const decade = /^[0-9]{4}$/.test(movie.year) ? `${Math.floor(Number(movie.year) / 10) * 10}년대` : "";
  const context = [decade, movie.country, movie.genre].filter(Boolean).join(" ");
  const viewingPoints = [];
  if (context) viewingPoints.push(`${context}의 문법 안에서 이 이야기가 고른 길`);
  if (movie.genre && themes.length) viewingPoints.push(`${movie.genre}가 ${themes.slice(0, 3).join(" · ")}를 다루는 방식`);
  if (movie.year) viewingPoints.push(`${movie.year}년의 공기가 화면에 남긴 것`);
  if (!viewingPoints.length) viewingPoints.push("장면의 분위기와 이야기의 리듬");

  // 각 카드 하단의 "" 인용문 — 그 카드 위 포인트들을 한 문장으로 누른 요약.
  // 예전 closingNote는 comment 복붙이라 2장(작품 개요)과 겹쳤다.
  const keyPointsNote = shorten(synopsisSentences[0] || basicDescription, 110);
  const viewingPointsNote = shorten(
    context
      ? `${context} — ${themes.length ? `${themes.slice(0, 2).join("과 ")}의 이야기다.` : "그 시대의 결이 밴 화면이다."}`
      : basicDescription,
    110,
  );

  return {
    headline: movie.title,
    basicDescription: shorten(basicDescription, 240),
    synopsis: shorten(synopsisText || basicDescription, 520),
    keyPoints: keyPoints.slice(0, 3).map((point) => shorten(point, 150)),
    viewingPoints: viewingPoints.slice(0, 3).map((point) => shorten(point, 120)),
    keyPointsNote,
    viewingPointsNote,
  };
}

export function buildSingleMovieCarousel(input, overrides = {}) {
  const movie = carouselMovie(input);
  const draft = { ...buildSingleMovieDraft(movie), ...overrides };
  const keyPoints = Array.isArray(overrides.keyPoints) ? overrides.keyPoints.map(clean).filter(Boolean) : draft.keyPoints;
  const viewingPoints = Array.isArray(overrides.viewingPoints) ? overrides.viewingPoints.map(clean).filter(Boolean) : draft.viewingPoints;
  return {
    id: `movie-${movie.slug || movie.id}`,
    kind: "single",
    label: movie.title,
    headline: clean(draft.headline) || movie.title,
    movie,
    slides: [
      { role: "cover", label: "표지", movie },
      { role: "basic", label: "작품 개요", movie, text: clean(draft.basicDescription) },
      { role: "synopsis", label: "줄거리 요약", movie, text: clean(draft.synopsis) },
      { role: "key-points", label: "핵심 내용", movie, points: keyPoints.slice(0, 3), note: clean(draft.keyPointsNote) },
      { role: "viewing-points", label: "감상 포인트", movie, points: viewingPoints.slice(0, 3), note: clean(draft.viewingPointsNote) },
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
