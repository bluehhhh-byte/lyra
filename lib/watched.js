import fs from "fs";
import path from "path";
import { readRuntimeData } from "./store.js";

// 왓챠에서 평가한 영화 ~1,000편의 데이터셋. 개별 .md 페이지 대신 한 파일에
// 모아 둔다(data/watcha-movies.json) — 취향 분석·별점 목록의 원천.
// 별점은 왓챠 재추출본을 code로 병합한다(data/watcha-ratings.json이 있으면).
//
// 스키마(항목): { code, title, title_ko, media, year, runtime, director,
//   director_ko, cast[], genre, country, poster, tmdbId, rating|null, isReview }

const DATA = path.join(process.cwd(), "data", "watcha-movies.json");
const RATINGS = path.join(process.cwd(), "data", "watcha-ratings.json");

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

let CACHE = null;

export function getWatched() {
  if (CACHE) return CACHE;
  const watched = readWatched();
  if (process.env.NODE_ENV === "production") CACHE = watched;
  return watched;
}

// 왓챠 1045편 — 별점 병합까지 매 호출마다 다시 하지 않도록 위에서 캐시한다
function readWatched() {
  const movies = readJson(DATA, []);
  // { code: rating } — 관리자 임포트가 써두면 여기서 별점을 채운다
  const ratings = readJson(RATINGS, {});
  return movies.map((m) => ({
    ...m,
    // 파일 자체 rating이 있으면 우선, 없으면 재추출본에서
    rating: m.rating ?? (ratings[m.code] != null ? Number(ratings[m.code]) : null),
  }));
}

// 별점 있는 것만 (취향 "호불호" 분석은 평가된 것만 의미가 있다)
export const getRated = () => getWatched().filter((m) => m.rating != null);

export async function getWatchedRuntime() {
  const [movies, ratings] = await Promise.all([
    readRuntimeData("watcha-movies.json", []),
    readRuntimeData("watcha-ratings.json", {}),
  ]);
  return movies.map((movie) => ({
    ...movie,
    rating: movie.rating ?? (ratings[movie.code] != null ? Number(ratings[movie.code]) : null),
  }));
}

const numericRating = (movie) => {
  const rating = Number(movie?.rating);
  return Number.isFinite(rating) && rating >= 0.5 && rating <= 5 ? rating : null;
};

// 고정된 반 칸 버킷을 모두 돌려준다. 0건인 별점도 화면에 남아 분포 축이
// 데이터에 따라 흔들리지 않는다.
export function ratingDistribution(movies) {
  const counts = new Map(Array.from({ length: 10 }, (_, index) => [(index + 1) / 2, 0]));
  let total = 0;
  for (const movie of movies) {
    const rating = numericRating(movie);
    if (rating == null || !counts.has(rating)) continue;
    counts.set(rating, counts.get(rating) + 1);
    total += 1;
  }
  return [...counts].map(([rating, count]) => ({
    rating,
    count,
    share: total ? count / total : 0,
  }));
}

// Watcha 데이터에는 관람일이 없으므로 여기서 말하는 연도는 작품 공개연도다.
// 숫자인 연도만 사용하고 오름차순으로 고정해 같은 입력은 같은 선을 만든다.
export function yearlyRatingTrend(movies) {
  const years = new Map();
  for (const movie of movies) {
    const rating = numericRating(movie);
    const year = Number(movie?.year);
    if (rating == null || !Number.isInteger(year) || year < 1888 || year > 2100) continue;
    const row = years.get(year) || { year, count: 0, sum: 0 };
    row.count += 1;
    row.sum += rating;
    years.set(year, row);
  }
  return [...years.values()]
    .sort((a, b) => a.year - b.year)
    .map(({ year, count, sum }) => ({ year, count, average: sum / count }));
}

function ratingGroups(movies, keyFn) {
  const groups = new Map();
  for (const movie of movies) {
    const rating = numericRating(movie);
    if (rating == null) continue;
    const keys = Array.isArray(keyFn(movie)) ? keyFn(movie) : [keyFn(movie)];
    for (const value of keys) {
      const key = String(value || "").trim();
      if (!key) continue;
      const row = groups.get(key) || { k: key, n: 0, sum: 0 };
      row.n += 1;
      row.sum += rating;
      groups.set(key, row);
    }
  }
  return [...groups.values()].map(({ k, n, sum }) => ({ k, n, avg: sum / n }));
}

export function directorPreferences(movies, { min = 3, limit = 10 } = {}) {
  const rated = movies.filter((movie) => numericRating(movie) != null);
  const mean = rated.length
    ? rated.reduce((sum, movie) => sum + numericRating(movie), 0) / rated.length
    : 0;
  const rows = ratingGroups(rated, (movie) => movie.director_ko || movie.director);
  const eligible = rows.filter((row) => row.n >= min);
  return {
    mean,
    min,
    excluded: rows.length - eligible.length,
    byCount: [...rows].sort((a, b) => b.n - a.n || a.k.localeCompare(b.k, "ko")).slice(0, limit),
    high: eligible
      .filter((row) => row.avg > mean)
      .sort((a, b) => b.avg - a.avg || b.n - a.n || a.k.localeCompare(b.k, "ko"))
      .slice(0, limit),
    low: eligible
      .filter((row) => row.avg < mean)
      .sort((a, b) => a.avg - b.avg || b.n - a.n || a.k.localeCompare(b.k, "ko"))
      .slice(0, limit),
  };
}
