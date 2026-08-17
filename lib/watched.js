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
