import { summarizeMusicTaste, interpretMusicTaste, recentShift } from "./music-taste-core.js";
import { latestDayInsight } from "./latest-day.js";

const recordedAt = (item) => item.published || item.date || "";

export function buildHomeInsights(songs, movies, report = null) {
  const taste = summarizeMusicTaste(songs);
  const portrait = interpretMusicTaste(taste);
  const shift = recentShift(songs);

  const recent = [
    ...songs.slice(0, 4).map((song) => ({
      kind: "music",
      slug: song.slug,
      title: song.title,
      subtitle: song.artist,
      image: song.artwork,
      recorded: recordedAt(song),
    })),
    ...movies.slice(0, 2).map((movie) => ({
      kind: "movie",
      slug: movie.slug,
      title: movie.title,
      subtitle: movie.director,
      image: movie.poster,
      recorded: recordedAt(movie),
    })),
  ]
    .sort((a, b) => b.recorded.localeCompare(a.recorded));

  return { taste, portrait, shift, recent, latest: latestDayInsight(songs, movies), report };
}

export function shiftSentence(shift) {
  if (!shift) return "기록이 더 쌓이면 최근 취향의 변화를 보여드립니다.";
  const parts = [shift.genre?.name, shift.region?.name, shift.emotion?.name].filter(Boolean);
  const direction =
    shift.valenceRecent > shift.valenceAll + 0.3
      ? "정서는 이전보다 밝아졌습니다"
      : shift.valenceRecent < shift.valenceAll - 0.3
        ? "정서는 이전보다 어두워졌습니다"
        : "정서의 밝기는 전체 기록과 비슷합니다";
  return `최근 ${shift.n}곡에는 ${parts.join("·")}이 두드러지고, ${direction}.`;
}
