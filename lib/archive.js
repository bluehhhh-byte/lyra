import { getAllSongs, getAllSongsRuntime } from "./songs.js";
import { getAllMovies, getAllMoviesRuntime } from "./movies.js";
import { parseEmotion, emotionValence } from "./keywords.js";
import { kstDay } from "./kst.js";
import { dayInsights } from "./latest-day.js";

const tally = (values) => {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

export function buildArchive({ songs = getAllSongs(), movies = getAllMovies() } = {}) {
  const byDay = new Map();
  const insightByDay = new Map(dayInsights(songs, movies).map((insight) => [insight.day, insight]));
  const add = (day, item) => {
    if (!day) return;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(item);
  };

  for (const song of songs) {
    add(kstDay(song.published || song.date), {
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
    add(kstDay(movie.published || movie.date), {
      type: "movie",
      slug: movie.slug,
      title: movie.title_ko || movie.title,
      subtitle: movie.director_ko || movie.director || "",
      image: movie.poster,
      comment: movie.comment || "",
      rating: movie.rating,
      media: movie.media === "tv" ? "tv" : "movie",
      themes: movie.themes || [],
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
        insight: insightByDay.get(day) || null,
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

export function sameDayRecords(current, songs, movies) {
  const day = kstDay(current?.published || current?.date);
  if (!day) return [];
  return [
    ...songs.filter((song) => song.slug !== current.slug && kstDay(song.published || song.date) === day).map((song) => ({ type: "song", slug: song.slug, title: song.title, subtitle: song.artist })),
    ...movies.filter((movie) => kstDay(movie.published || movie.date) === day).map((movie) => ({ type: "movie", slug: movie.slug, title: movie.title_ko || movie.title, subtitle: movie.director_ko || movie.director || "" })),
  ].sort((a, b) => a.type.localeCompare(b.type) || a.title.localeCompare(b.title, "ko"));
}

// 월간 요약 문장은 lib/archive-stats.js의 monthNarrative()로 옮겼다 — 감정 좌표와
// 이동·대표작을 쓰는 실제 분석이라 '기록했고' 식 행동 나열이 아니다.

export async function buildArchiveRuntime() {
  const [songs, movies] = await Promise.all([getAllSongsRuntime(), getAllMoviesRuntime()]);
  return buildArchive({ songs, movies });
}

export async function getArchiveDayRuntime(day) {
  return (await buildArchiveRuntime()).find((entry) => entry.day === day) || null;
}
