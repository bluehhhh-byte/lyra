const text = (value) =>
  [].concat(value || []).filter(Boolean).join(" ").toLowerCase();

export const decadeOfYear = (year) => {
  const value = Number(year);
  return value ? `${Math.floor(value / 10) * 10}s` : "";
};

export function prepareWatched(items) {
  return items.map((movie) => ({
    ...movie,
    searchText: text([
      movie.title,
      movie.title_ko,
      movie.director,
      movie.director_ko,
      movie.cast,
      movie.genre,
      movie.country,
    ]),
    decade: decadeOfYear(movie.year),
  }));
}

export function filterWatched(items, filters = {}) {
  const needle = String(filters.q || "").trim().toLowerCase();
  return items.filter(
    (movie) =>
      (!needle || movie.searchText.includes(needle)) &&
      (!filters.rating || Number(movie.rating) === Number(filters.rating)) &&
      (!filters.country || movie.country === filters.country) &&
      (!filters.genre || [].concat(movie.genre || []).includes(filters.genre)) &&
      (!filters.decade || movie.decade === filters.decade)
  );
}

export function attachCuratedLinks(watched, curated) {
  const byTmdb = new Map(
    curated.filter((movie) => movie.tmdbId).map((movie) => [String(movie.tmdbId), movie.slug])
  );
  const titleKey = (movie) => text(movie.title_ko || movie.title).replace(/\s+/g, "");
  const byTitle = new Map(curated.map((movie) => [titleKey(movie), movie.slug]));
  return watched.map((movie) => {
    const slug = byTmdb.get(String(movie.tmdbId || "")) || byTitle.get(titleKey(movie));
    return { ...movie, internalHref: slug ? `/movies/${slug}` : "" };
  });
}
