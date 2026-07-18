// TMDB wrapper — search + full detail, Korean-first. Server-only (holds the key).
// Docs: https://developer.themoviedb.org/reference
const KEY = process.env.TMDB_API_KEY;
const BASE = "https://api.themoviedb.org/3";
export const IMG = "https://image.tmdb.org/t/p"; // + /w500/<path> etc.

async function tmdb(path, params = {}) {
  if (!KEY) throw new Error("TMDB_API_KEY 환경변수가 없습니다");
  const qs = new URLSearchParams({ api_key: KEY, language: "ko-KR", ...params });
  const res = await fetch(`${BASE}${path}?${qs}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

// Search results for the admin picker — light shape, poster thumb for the list.
export async function searchMovies(query) {
  const { results = [] } = await tmdb("/search/movie", { query, include_adult: "false" });
  return results.slice(0, 20).map((m) => ({
    tmdbId: m.id,
    title: m.title || m.original_title,
    originalTitle: m.original_title,
    year: (m.release_date || "").slice(0, 4),
    thumb: m.poster_path ? `${IMG}/w154${m.poster_path}` : "",
    overview: m.overview || "",
  }));
}

// ISO country → the site's Korean nationality label (matches the song tags)
const COUNTRY = { KR: "한국", JP: "일본", US: "미국", GB: "영국", FR: "프랑스", HK: "홍콩", CN: "중국", TW: "대만" };
const countryLabel = (m) => {
  const iso = m.production_countries?.[0]?.iso_3166_1 || (m.original_language === "ko" ? "KR" : m.original_language === "ja" ? "JP" : "");
  return COUNTRY[iso] || "기타";
};

// Full detail for the save step — everything a movie .md needs.
export async function movieDetail(tmdbId) {
  const m = await tmdb(`/movie/${tmdbId}`, { append_to_response: "credits" });
  const director = (m.credits?.crew || []).find((c) => c.job === "Director")?.name || "";
  const cast = (m.credits?.cast || []).slice(0, 3).map((c) => c.name).join(", ");
  return {
    tmdbId: m.id,
    title: m.title || m.original_title,
    originalTitle: m.original_title,
    year: (m.release_date || "").slice(0, 4),
    runtime: m.runtime || "",
    director,
    cast,
    genre: m.genres?.[0]?.name || "",
    country: countryLabel(m),
    overview: m.overview || "",
    poster: m.poster_path ? `${IMG}/w500${m.poster_path}` : "",
    backdrop: m.backdrop_path ? `${IMG}/w1280${m.backdrop_path}` : "",
  };
}
