import { getAllSongs } from "./songs.js";
import { getAllMovies } from "./movies.js";
import { parseEmotion, emotionValence } from "./keywords.js";

const tally = (values) => {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

export function buildArchive({ songs = getAllSongs(), movies = getAllMovies() } = {}) {
  const byDay = new Map();
  const add = (day, item) => {
    if (!day) return;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(item);
  };

  for (const song of songs) {
    add((song.published || song.date || "").slice(0, 10), {
      type: "song",
      slug: song.slug,
      title: song.title,
      subtitle: song.artist,
      image: song.artwork,
      comment: song.comment || "",
      emotion: parseEmotion(song.emotion),
      keywords: song.keywords || [],
      published: song.published || song.date || "",
    });
  }

  for (const movie of movies) {
    add((movie.published || movie.date || "").slice(0, 10), {
      type: "movie",
      slug: movie.slug,
      title: movie.title_ko || movie.title,
      subtitle: movie.director_ko || movie.director || "",
      image: movie.poster,
      comment: movie.comment || "",
      rating: movie.rating,
      media: movie.media === "tv" ? "tv" : "movie",
      published: movie.published || movie.date || "",
    });
  }

  return [...byDay.entries()]
    .map(([day, items]) => {
      items.sort((a, b) => b.published.localeCompare(a.published));
      const songsOfDay = items.filter((item) => item.type === "song");
      const emotions = tally(songsOfDay.map((item) => item.emotion));
      const keywords = tally(songsOfDay.flatMap((item) => item.keywords));
      const valences = songsOfDay.map((item) => item.emotion).filter(Boolean).map(emotionValence);
      return {
        day,
        items,
        songs: songsOfDay.length,
        movies: items.length - songsOfDay.length,
        dominant: emotions[0]?.[0] || "",
        emotions,
        keywords,
        valence: valences.length
          ? valences.reduce((sum, value) => sum + value, 0) / valences.length
          : null,
      };
    })
    .sort((a, b) => a.day.localeCompare(b.day));
}

export function getArchiveDay(day, options) {
  return buildArchive(options).find((entry) => entry.day === day) || null;
}
