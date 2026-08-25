const recordedAt = (movie) => movie.published || movie.date || "";
const titleOf = (movie) => movie.title_ko || movie.title || "제목 없음";

const eligible = (movie) => movie.slug && movie.poster && movie.comment;

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

export function publishCandidates(movies, { recentLimit = 6, rediscoveryLimit = 4, themeLimit = 3 } = {}) {
  const ready = movies.filter(eligible).sort((a, b) => recordedAt(b).localeCompare(recordedAt(a)));
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
