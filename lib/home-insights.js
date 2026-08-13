import { summarizeMusicTaste, interpretMusicTaste, recentShift } from "./music-taste-core.js";

const recordedAt = (item) => item.published || item.date || "";
const spread = (items, count) => {
  if (items.length <= count) return items;
  const last = items.length - 1;
  return Array.from({ length: count }, (_, index) => items[Math.round((index * last) / (count - 1))]);
};

export function buildHomeInsights(songs, movies) {
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

  // 오래된 기록을 다시 꺼내되 빌드할 때마다 바뀌지 않게 중간 지점을 쓴다.
  // 무작위 추천은 이미 컬렉션 필터에 있고, 여기서는 시간의 깊이를 보여주는 게 목적이다.
  const olderSongs = songs.slice(songs.length > 24 ? 24 : 4);
  const olderMovies = movies.slice(movies.length > 12 ? 12 : 2);
  const revisit = [
    ...spread([...olderSongs].sort((a, b) => recordedAt(a).localeCompare(recordedAt(b))), 2),
    ...spread([...olderMovies].sort((a, b) => recordedAt(a).localeCompare(recordedAt(b))), 2),
  ]
    .map((item) => {
      const movie = "poster" in item;
      return {
        kind: movie ? "movie" : "music",
        slug: item.slug,
        title: item.title,
        subtitle: movie ? item.director : item.artist,
        image: movie ? item.poster : item.artwork,
        recorded: recordedAt(item),
      };
    });

  return { taste, portrait, shift, recent, revisit };
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
