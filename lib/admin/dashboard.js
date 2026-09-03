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

// 결손이 수백 건이면 화면에 다 담아도 읽히지 않고 RSC 페이로드만 불어난다.
const NEEDS_LIST_MAX = 30;

export function buildAdminOverview({ songs = [], movies = [], contentStore, contentFallback, deployment, history = [] }) {
  const songNeedsList = songs
    .map((song) => ({ kind: "song", slug: song.slug, title: song.title, subtitle: song.artist || "", needs: summarizeNeeds(song) }))
    .filter((item) => item.needs.length > 0);
  const movieNeedsList = movies
    .map((movie) => ({ kind: "movie", slug: movie.slug, title: movie.title, subtitle: movie.director || "", needs: movieNeeds(movie) }))
    .filter((item) => item.needs.length > 0);
  const songTitles = new Map(songs.map((song) => [song.slug, song.title]));
  const movieTitles = new Map(movies.map((movie) => [movie.slug, movie.title]));
  return {
    songCount: songs.length,
    movieCount: movies.length,
    songNeeds: songNeedsList.length,
    movieNeeds: movieNeedsList.length,
    // 개수만 내보내면 "결손 3건"을 보고도 어느 곡인지 알 길이 없어, 로컬에서
    // scripts/needs-work.mjs를 돌려야 했다. 판정은 그대로 needs.js 한 곳에서
    // 하고, 여기서는 이미 계산한 결과를 버리지 않고 함께 넘긴다.
    needsList: [...songNeedsList, ...movieNeedsList].slice(0, NEEDS_LIST_MAX),
    needsListTruncated: Math.max(0, songNeedsList.length + movieNeedsList.length - NEEDS_LIST_MAX),
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
