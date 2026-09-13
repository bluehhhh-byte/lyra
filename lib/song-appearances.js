import { readRuntimeData } from "./store.js";
import { WORK_TYPES, APPEARANCE_ROLES } from "./appearance-labels.js";

export const SONG_APPEARANCES_FILE = "song-appearances.json";

// 라벨은 lib/appearance-labels.js — 클라이언트(caption)와 같은 원본을 쓴다.
export { WORK_TYPES, APPEARANCE_ROLES };

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
    // 캡션·카드가 감독 이름을 함께 쓴다. 한글 표기가 원칙, 원문은 보조.
    director_ko: clean(value.director_ko, 200),
    director: clean(value.director, 200),
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

export function carouselAppearanceSummary(items = [], { limit = 3 } = {}) {
  const appearances = Array.isArray(items) ? items : [];
  const visible = appearances.slice(0, Math.max(1, Number(limit) || 3));
  const summary = visible.map((item) => {
    const title = clean(item?.workTitle, 200);
    if (!title) return "";
    const year = integerOrNull(item?.year);
    const director = clean(item?.director_ko, 200) || clean(item?.director, 200);
    const head = `〈${title}〉${year ? ` (${year})` : ""}`;
    return `${head} · ${[director, appearanceContext(item)].filter(Boolean).join(" · ")}`;
  }).filter(Boolean);
  if (appearances.length > visible.length) summary.push(`외 ${appearances.length - visible.length}편`);
  return summary.join(" / ");
}

export async function getSongAppearancesRuntime() {
  return normalizeAppearanceData(await readRuntimeData(SONG_APPEARANCES_FILE, { version: 1, items: [] }));
}
