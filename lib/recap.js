const tally = (values) => {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

export function buildRecap(archive, period) {
  const days = archive.filter((entry) => entry.day.startsWith(period));
  const items = days.flatMap((entry) => entry.items);
  const songs = items.filter((item) => item.type === "song");
  const movies = items.filter((item) => item.type === "movie");
  const emotions = tally(songs.map((song) => song.emotion));
  const keywords = tally(songs.flatMap((song) => song.keywords));
  const artists = tally(songs.map((song) => song.subtitle));
  const ratedMovies = movies.filter((movie) => movie.rating != null).sort((a, b) => b.rating - a.rating);
  const valences = days.map((day) => day.valence).filter((value) => value !== null);

  return {
    period,
    days,
    items,
    songs,
    movies,
    emotions,
    keywords,
    artists,
    topMovie: ratedMovies[0] || null,
    averageValence: valences.length
      ? valences.reduce((sum, value) => sum + value, 0) / valences.length
      : null,
  };
}
