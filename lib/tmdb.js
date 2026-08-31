// TMDB wrapper — search + full detail, Korean-first. Server-only (holds the key).
// Docs: https://developer.themoviedb.org/reference
const KEY = process.env.TMDB_API_KEY;
const BASE = "https://api.themoviedb.org/3";
export const IMG = "https://image.tmdb.org/t/p"; // + /w500/<path> etc.

// The API is queried as ko-KR (titles/overview should be Korean), so genre
// names arrive Korean too — but the site files genres in English, same as the
// song side (J-Rock, Disco…). Unknown names pass through untouched.
const GENRE_EN = new Map([
  ["액션", "Action"], ["모험", "Adventure"], ["애니메이션", "Animation"], ["코미디", "Comedy"],
  ["범죄", "Crime"], ["다큐멘터리", "Documentary"], ["드라마", "Drama"], ["가족", "Family"],
  ["판타지", "Fantasy"], ["역사", "History"], ["공포", "Horror"], ["음악", "Music"],
  ["미스터리", "Mystery"], ["로맨스", "Romance"], ["SF", "Sci-Fi"], ["TV 영화", "TV Movie"],
  ["스릴러", "Thriller"], ["전쟁", "War"], ["서부", "Western"],
  // TV-genre variants
  ["Sci-Fi & Fantasy", "Sci-Fi"], ["War & Politics", "War"], ["액션 & 어드벤처", "Action"],
  ["키즈", "Family"], ["뉴스", "Documentary"], ["리얼리티", "Reality"], ["소프", "Drama"], ["토크", "Talk"],
]);
const genreEn = (name) => GENRE_EN.get(name) || name;

async function tmdb(path, params = {}) {
  if (!KEY) throw new Error("TMDB_API_KEY 환경변수가 없습니다");
  const qs = new URLSearchParams({ api_key: KEY, language: "ko-KR", ...params });
  const res = await fetch(`${BASE}${path}?${qs}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

// Search results for the admin picker — movie + TV drama, light shape, poster
// thumb for the list.
export async function searchMovies(query) {
  const { results = [] } = await tmdb("/search/multi", { query, include_adult: "false" });
  return results
    .filter((m) => m.media_type === "movie" || m.media_type === "tv")
    .slice(0, 20)
    .map((m) => ({
      tmdbId: m.id,
      mediaType: m.media_type,
      kind: m.media_type === "tv" ? "드라마" : "영화",
      title: m.title || m.name || m.original_title || m.original_name,
      originalTitle: m.original_title || m.original_name,
      year: (m.release_date || m.first_air_date || "").slice(0, 4),
      thumb: m.poster_path ? `${IMG}/w154${m.poster_path}` : "",
      overview: m.overview || "",
    }));
}

// ISO country → the site's country-group label (song tags와 같은 어휘:
// 한국·일본·영미·유럽·기타). 개별 국가명 대신 권역으로 묶는다.
const ANGLO = new Set(["US", "GB", "CA", "AU", "NZ"]);
const EUROPE = new Set([
  "FR", "DE", "DK", "IT", "ES", "SE", "NO", "FI", "NL", "BE", "AT", "CH", "IE",
  "PT", "PL", "CZ", "HU", "GR", "IS", "RU", "UA", "RO", "BG", "HR", "RS", "SK",
  "SI", "EE", "LV", "LT", "LU",
]);
// 한국·일본은 따로, 나머지 아시아는 아시아로
const ASIA = new Set([
  "HK", "CN", "TW", "MO", "IN", "TH", "VN", "ID", "PH", "SG", "MY", "MN",
  "KH", "LA", "MM", "LK", "BD", "PK", "NP", "KZ", "UZ",
]);
const LATAM = new Set([
  "MX", "BR", "AR", "CL", "CO", "PE", "VE", "UY", "PY", "BO", "EC", "CR",
  "PA", "GT", "HN", "SV", "NI", "CU", "DO", "PR", "JM", "HT",
]);
const MIDEAST = new Set([
  "IR", "IQ", "IL", "SA", "AE", "TR", "EG", "LB", "JO", "SY", "KW", "QA",
  "OM", "YE", "BH", "PS", "AF",
]);
const countryLabel = (m) => {
  const iso = m.production_countries?.[0]?.iso_3166_1 || (m.original_language === "ko" ? "KR" : m.original_language === "ja" ? "JP" : "");
  if (iso === "KR") return "한국";
  if (iso === "JP") return "일본";
  if (ANGLO.has(iso)) return "영미";
  if (EUROPE.has(iso)) return "유럽";
  if (ASIA.has(iso)) return "아시아";
  if (LATAM.has(iso)) return "중남미";
  if (MIDEAST.has(iso)) return "중동";
  return "기타";
};

// Full detail for the save step — everything a movie/drama .md needs.
export async function movieDetail(tmdbId, mediaType = "movie") {
  const isTv = mediaType === "tv";
  const m = await tmdb(`/${isTv ? "tv" : "movie"}/${tmdbId}`, { append_to_response: "credits" });
  const crew = m.credits?.crew || [];
  const director =
    (isTv
      ? m.created_by?.[0]?.name || crew.find((c) => ["Creator", "Director", "Executive Producer"].includes(c.job))?.name
      : crew.find((c) => c.job === "Director")?.name) || "";
  const cast = (m.credits?.cast || []).slice(0, 3).map((c) => c.name).join(", ");
  const genres = (m.genres || []).map((genre) => genreEn(genre.name)).filter(Boolean);
  return {
    tmdbId: m.id,
    mediaType: isTv ? "tv" : "movie",
    kind: isTv ? "드라마" : "영화",
    title: m.title || m.name || m.original_title || m.original_name,
    originalTitle: m.original_title || m.original_name,
    year: (m.release_date || m.first_air_date || "").slice(0, 4),
    runtime: m.runtime || m.episode_run_time?.[0] || "",
    director,
    cast,
    genre: genres[0] || "",
    genres,
    isAnimation: genres.includes("Animation"),
    tmdbRating: m.vote_average || "",
    tmdbVotes: m.vote_count || "",
    country: countryLabel(m),
    overview: m.overview || "",
    poster: m.poster_path ? `${IMG}/w500${m.poster_path}` : "",
    backdrop: m.backdrop_path ? `${IMG}/w1280${m.backdrop_path}` : "",
  };
}
