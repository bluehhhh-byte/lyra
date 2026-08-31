import { readRuntimeData } from "./store.js";

export const SONG_APPEARANCES_FILE = "song-appearances.json";

export const WORK_TYPES = Object.freeze({
  movie: "영화",
  drama: "드라마",
  anime_movie: "극장판 애니메이션",
  anime_series: "TV 애니메이션",
});

export const APPEARANCE_ROLES = Object.freeze({
  main_theme: "메인 주제가",
  opening: "오프닝",
  ending: "엔딩",
  insert_song: "삽입곡",
  background: "배경음악",
  trailer: "예고편·프로모션",
  character_song: "캐릭터송",
  other: "기타",
});

const clean = (value, max = 500) => String(value ?? "").trim().slice(0, max);
const integerOrNull = (value) => {
  if (value === "" || value == null) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
};

export function normalizeAppearance(value = {}) {
  value = value && typeof value === "object" ? value : {};
  const mediaType = value.mediaType === "tv" ? "tv" : "movie";
  const fallbackType = mediaType === "tv" ? "drama" : "movie";
  const workType = Object.hasOwn(WORK_TYPES, value.workType) ? value.workType : fallbackType;
  const role = Object.hasOwn(APPEARANCE_ROLES, value.role) ? value.role : "other";
  return {
    id: clean(value.id, 100),
    songSlug: clean(value.songSlug, 200),
    workTitle: clean(value.workTitle, 200),
    originalTitle: clean(value.originalTitle, 200),
    workType,
    mediaType,
    tmdbId: integerOrNull(value.tmdbId),
    localMovieSlug: clean(value.localMovieSlug, 200),
    year: integerOrNull(value.year),
    poster: clean(value.poster, 1000),
    role,
    season: integerOrNull(value.season),
    episode: integerOrNull(value.episode),
    evidenceUrl: clean(value.evidenceUrl, 1500),
    evidenceLabel: clean(value.evidenceLabel, 100),
    status: value.status === "verified" ? "verified" : "pending",
    note: clean(value.note, 500),
    createdAt: clean(value.createdAt, 50),
    updatedAt: clean(value.updatedAt, 50),
  };
}

export function normalizeAppearanceData(value) {
  const items = Array.isArray(value?.items)
    ? value.items.map(normalizeAppearance).filter((item) => item.id && item.songSlug && item.workTitle)
    : [];
  return { version: 1, updatedAt: clean(value?.updatedAt, 50), items };
}

export function appearanceIdentity(item) {
  const work = item.tmdbId
    ? `tmdb:${item.mediaType}:${item.tmdbId}`
    : `title:${item.workTitle.toLocaleLowerCase("ko-KR")}:${item.year || ""}`;
  return [item.songSlug, work, item.role, item.season ?? "", item.episode ?? ""].join("|");
}

export function appearancesForSong(data, songSlug, { includePending = false } = {}) {
  return normalizeAppearanceData(data).items.filter(
    (item) => item.songSlug === songSlug && (includePending || item.status === "verified")
  );
}

export function appearancesForMovie(data, movie, { includePending = false } = {}) {
  return normalizeAppearanceData(data).items.filter((item) => {
    if (!includePending && item.status !== "verified") return false;
    if (item.localMovieSlug && item.localMovieSlug === movie.slug) return true;
    return Boolean(item.tmdbId && movie.tmdbId && Number(item.tmdbId) === Number(movie.tmdbId));
  });
}

export function appearanceContext(item) {
  const parts = [WORK_TYPES[item.workType] || WORK_TYPES.movie, APPEARANCE_ROLES[item.role] || APPEARANCE_ROLES.other];
  if (item.season != null) parts.push(`시즌 ${item.season}`);
  if (item.episode != null) parts.push(`${item.episode}화`);
  return parts.join(" · ");
}

export async function getSongAppearancesRuntime() {
  return normalizeAppearanceData(await readRuntimeData(SONG_APPEARANCES_FILE, { version: 1, items: [] }));
}
