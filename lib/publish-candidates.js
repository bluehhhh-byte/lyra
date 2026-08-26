const recordedAt = (movie) => movie.published || movie.date || "";
const titleOf = (movie) => movie.title_ko || movie.title || "제목 없음";

const eligible = (movie) => movie.slug && movie.poster && movie.comment;

const normalizedTitle = (value) => String(value || "")
  .normalize("NFKC")
  .trim()
  .toLocaleLowerCase("ko-KR");

const identityKeys = (movie) => {
  const keys = [];
  if (movie.tmdbId != null && String(movie.tmdbId).trim()) keys.push(`tmdb:${movie.tmdbId}`);
  for (const title of [movie.title, movie.title_ko]) {
    const normalized = normalizedTitle(title);
    if (normalized) keys.push(`title:${normalized}:${movie.year || ""}`);
  }
  return keys;
};

const dateLabel = (value) => {
  const day = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "기록일 미상";
  const [, month, date] = day.split("-");
  return `${Number(month)}월 ${Number(date)}일 기록`;
};

const movieCandidate = (movie, reason) => ({
  slug: movie.slug,
  title: titleOf(movie),
  director: movie.director_ko || movie.director || "",
  poster: movie.poster,
  rating: movie.rating == null || !Number.isFinite(Number(movie.rating)) ? null : Number(movie.rating),
  themes: movie.themes || [],
  reason,
});

export function publishedMovieSlugs(dataset = {}) {
  return new Set((dataset.items || [])
    .filter((item) => item?.kind === "movie" && item.slug)
    .map((item) => String(item.slug)));
}

export function publicationHistory(dataset = {}, limit = 20) {
  return (dataset.items || [])
    .filter((item) => item?.kind === "movie" && item.slug && item.publishedAt)
    .map((item) => ({
      kind: "movie",
      slug: String(item.slug),
      title: String(item.title || item.slug),
      publishedAt: String(item.publishedAt),
    }))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, Math.max(0, limit));
}

export function completePublication(dataset = {}, item, now = () => new Date().toISOString()) {
  const slug = String(item?.slug || "").trim();
  if (!slug) throw new Error("발행 완료 처리할 작품이 없습니다.");
  const items = (dataset.items || []).filter((entry) => !(entry?.kind === "movie" && entry.slug === slug));
  const publishedAt = now();
  items.push({ kind: "movie", slug, title: String(item?.title || ""), publishedAt });
  return { items, at: publishedAt };
}

export function publishCandidates(movies, { recentLimit = 6, rediscoveryLimit = 4, themeLimit = 3, published = {} } = {}) {
  const completed = publishedMovieSlugs(published);
  const ready = movies.filter(eligible).filter((movie) => !completed.has(movie.slug)).sort((a, b) => recordedAt(b).localeCompare(recordedAt(a)));
  const recentMovies = ready.slice(0, recentLimit);
  const recentSlugs = new Set(recentMovies.map((movie) => movie.slug));
  const recent = recentMovies.map((movie) => movieCandidate(
    movie,
    [dateLabel(recordedAt(movie)), ...(movie.themes || []).slice(0, 2).map((theme) => `#${theme}`)].join(" · "),
  ));

  const rediscovery = ready
    .filter((movie) => !recentSlugs.has(movie.slug) && Number(movie.rating) >= 4.5)
    .sort((a, b) => Number(b.rating) - Number(a.rating) || recordedAt(a).localeCompare(recordedAt(b)))
    .slice(0, rediscoveryLimit)
    .map((movie) => movieCandidate(movie, `★${Number(movie.rating).toFixed(1)} · ${dateLabel(recordedAt(movie))}`));

  const themeMap = new Map();
  for (const movie of ready) {
    for (const theme of movie.themes || []) {
      if (!themeMap.has(theme)) themeMap.set(theme, []);
      themeMap.get(theme).push(movie);
    }
  }
  const themes = [...themeMap]
    .filter(([, items]) => items.length >= 3)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, themeLimit)
    .map(([theme, items]) => ({
      theme,
      count: items.length,
      examples: items.slice(0, 3).map(titleOf),
      reason: `준비된 기록 ${items.length}편을 한 주제로 묶을 수 있음`,
    }));

  return { recent, rediscovery, themes };
}

export function unwrittenHighRatedCandidates(watched, curated, { minRating = 4.5, limit = 100 } = {}) {
  const written = new Set(curated.flatMap(identityKeys));
  return watched
    .filter((movie) => Number(movie.rating) >= minRating)
    .filter((movie) => !identityKeys(movie).some((key) => written.has(key)))
    .sort((a, b) => Number(b.rating) - Number(a.rating)
      || Number(b.year || 0) - Number(a.year || 0)
      || titleOf(a).localeCompare(titleOf(b), "ko"))
    .slice(0, limit)
    .map((movie) => ({
      key: movie.code || (movie.tmdbId ? `tmdb-${movie.tmdbId}` : `${titleOf(movie)}-${movie.year}`),
      title: titleOf(movie),
      director: movie.director_ko || movie.director || "",
      poster: movie.poster || "",
      rating: Number(movie.rating),
      year: movie.year || "",
      tmdbId: movie.tmdbId || null,
      media: movie.media || "movie",
    }));
}
