import { summarizeNeeds } from "./needs.js";

export function movieNeeds(movie) {
  return [
    !movie.tags?.length && "태그",
    !movie.comment && "코멘트",
    !movie.synopsis?.length && "줄거리",
    !movie.year && "연도",
    !movie.poster && "포스터",
  ].filter(Boolean);
}

const iso = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

export function buildAdminOverview({ songs = [], movies = [], contentStore, contentFallback, deployment, history = [] }) {
  const songTitles = new Map(songs.map((song) => [song.slug, song.title]));
  const movieTitles = new Map(movies.map((movie) => [movie.slug, movie.title]));
  return {
    songCount: songs.length,
    movieCount: movies.length,
    songNeeds: songs.filter((song) => summarizeNeeds(song).length > 0).length,
    movieNeeds: movies.filter((movie) => movieNeeds(movie).length > 0).length,
    contentStore: contentStore === "neon" ? "neon" : "files",
    contentFallback: contentFallback === true,
    deployment: deployment
      ? {
          status: String(deployment.status || ""),
          commitSha: String(deployment.commitSha || ""),
          deploymentId: String(deployment.deploymentId || ""),
          updatedAt: iso(deployment.updatedAt),
        }
      : null,
    history: history.map((item) => ({
      kind: item.kind === "movie" ? "movie" : "song",
      slug: String(item.slug || ""),
      title: (item.kind === "movie" ? movieTitles : songTitles).get(item.slug) || String(item.slug || ""),
      revision: Number(item.revision) || 0,
      updatedAt: iso(item.updatedAt),
    })),
  };
}
