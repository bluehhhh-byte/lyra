// TMDB wrapper — search + full detail, Korean-first. Server-only (holds the key).
// Docs: https://developer.themoviedb.org/reference
// 키는 정규화해서 읽는다. 붙여넣기에 딸려온 BOM(U+FEFF)·공백·따옴표 때문에
// LYRA_CONTENT_STORE와 DATABASE_URL이 이틀간 조용히 죽어 있던 적이 있다
// (docs/runbook-free-tier.md §5). 여기만 날것으로 읽고 있었다.
const cleanEnv = (value) =>
  String(value ?? "").replace(/^﻿/, "").trim().replace(/^(["'])([\s\S]*)\1$/, "$2").trim();
const KEY = cleanEnv(process.env.TMDB_API_KEY);
const BASE = "https://api.themoviedb.org/3";

// 무료 키의 한도는 공지 없이 바뀐다(과거 초당 40회 기준이 있었고 지금은 문서에
// 수치가 명시돼 있지 않다). 그래서 숫자를 박아 두고 세지 않는다 — 대신 429가
// 오면 서버가 준 Retry-After만큼만 기다렸다 한 번 더 시도하고, 그래도 막히면
// 사람에게 넘긴다. 스스로 폭주하지 않는 것이 목적이다.
const RETRY_ONCE_MS_MAX = 5_000;

export class TmdbError extends Error {
  constructor(message, { status = 0, kind = "unknown", retryable = false } = {}) {
    super(message);
    this.name = "TmdbError";
    this.status = status;
    this.kind = kind;
    this.retryable = retryable;
  }
}

// 상태 코드마다 사람이 할 일이 다르다. "TMDB 502"는 아무것도 알려주지 않는다.
export function tmdbErrorFor(status, retryAfterSeconds = 0) {
  if (status === 401 || status === 403) {
    return new TmdbError("TMDB 키가 거부됐습니다 — 환경변수 TMDB_API_KEY를 확인하세요 (앞뒤 공백·따옴표 포함).", { status, kind: "auth" });
  }
  if (status === 404) {
    return new TmdbError("TMDB에 해당 작품이 없습니다.", { status, kind: "not_found" });
  }
  if (status === 429) {
    const wait = retryAfterSeconds > 0 ? ` ${retryAfterSeconds}초 뒤에 다시 시도하세요.` : "";
    return new TmdbError(`TMDB 요청이 한도에 걸렸습니다.${wait}`, { status, kind: "rate_limit", retryable: true });
  }
  if (status >= 500) {
    return new TmdbError(`TMDB 서버 오류 (${status}) — 잠시 후 다시 시도하세요.`, { status, kind: "server", retryable: true });
  }
  return new TmdbError(`TMDB 요청 실패 (${status})`, { status, kind: "unknown" });
}

// 같은 검색어를 다시 치는 일이 잦다(오타 고치고 되돌아오기, 목록 닫았다 열기).
// 서버리스라 인스턴스마다 따로 살고 콜드 스타트에 사라진다 — 그래도 한 세션
// 안의 반복 호출은 막아 준다. 그 이상은 필요 없다.
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 200;
const cache = new Map();

const cacheGet = (key) => {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) { cache.delete(key); return null; }
  // 최근 쓴 것을 뒤로 — 넘칠 때 가장 오래 안 쓴 것부터 버린다
  cache.delete(key);
  cache.set(key, hit);
  return hit.value;
};
const cacheSet = (key, value) => {
  cache.set(key, { at: Date.now(), value });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
};
export const __clearTmdbCache = () => cache.clear();
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

async function tmdb(path, params = {}, { fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  if (!KEY) throw new TmdbError("TMDB_API_KEY 환경변수가 없습니다", { kind: "auth" });
  const qs = new URLSearchParams({ api_key: KEY, language: "ko-KR", ...params });
  const cacheKey = `${path}?${qs}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  // 재시도는 429에서 한 번뿐이다. 여러 번 하면 한도를 더 태우기만 한다.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetchImpl(`${BASE}${path}?${qs}`, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const body = await res.json();
      cacheSet(cacheKey, body);
      return body;
    }
    const retryAfter = Number(res.headers?.get?.("retry-after") || 0);
    const error = tmdbErrorFor(res.status, retryAfter);
    // 서버가 말한 만큼만 기다린다. 말이 없으면 재시도하지 않는다 — 임의의
    // 대기 시간을 지어내면 그게 곧 폭주의 시작이다.
    const canWait = attempt === 0 && error.kind === "rate_limit" && retryAfter > 0;
    if (!canWait) throw error;
    await sleep(Math.min(retryAfter * 1000, RETRY_ONCE_MS_MAX));
  }
  throw tmdbErrorFor(429);
}
export const __tmdbFetch = tmdb; // 테스트 전용 — fetch·sleep 주입

// Search results for the admin picker — movie + TV drama, light shape, poster
// thumb for the list.
const asResult = (m) => ({
  tmdbId: m.id,
  mediaType: m.media_type,
  kind: m.media_type === "tv" ? "드라마" : "영화",
  title: m.title || m.name || m.original_title || m.original_name,
  originalTitle: m.original_title || m.original_name,
  year: (m.release_date || m.first_air_date || "").slice(0, 4),
  thumb: m.poster_path ? `${IMG}/w154${m.poster_path}` : "",
  overview: m.overview || "",
});

async function searchOnce(query, language) {
  // language는 params로 들어가 기본값(ko-KR)을 덮는다. 캐시 키가 쿼리스트링이라
  // 두 언어가 서로의 캐시를 덮지 않는다.
  const { results = [] } = await tmdb("/search/multi", { query, language, include_adult: "false" });
  return results.filter((m) => m.media_type === "movie" || m.media_type === "tv").map(asResult);
}

// 한글로 치든 영어로 치든 같은 작품이 나와야 한다.
//
// TMDB는 두 언어 모두 매칭은 한다. 갈리는 것은 순위다 — `Parasite`를 ko-KR로
// 검색하면 「패러사이트 돌즈」가 1위로 오고 「기생충」은 밀린다. 같은 검색어를
// en-US로 치면 기생충이 1위다. 그래서 두 언어를 각각 물어 번갈아 합친다.
// 어느 쪽 언어로 쳤든 그 언어에서의 1위가 목록 맨 위에 선다.
//
// 표시 제목은 ko-KR 쪽을 쓴다(「이터널 선샤인」). 원제는 호출부가 함께 보여 준다 —
// 한국어 표기를 모르는 작품은 원제로 알아보기 때문이다.
export async function searchMovies(query) {
  const [korean, english] = await Promise.all([
    searchOnce(query, "ko-KR"),
    searchOnce(query, "en-US").catch(() => []),
  ]);
  // 친 언어 쪽 1위가 목록 1위여야 한다. 한글로 「기생충」을 치면 ko-KR 1위가
  // 맞고, 영어로 `Parasite`를 치면 en-US 1위가 맞다 — ko-KR은 그때
  // 「패러사이트 돌즈」를 먼저 준다.
  const [first, second] = /[가-힣]/.test(query) ? [korean, english] : [english, korean];
  const byId = new Map();
  for (let rank = 0; rank < Math.max(first.length, second.length); rank++) {
    for (const hit of [first[rank], second[rank]]) {
      if (!hit) continue;
      const key = `${hit.mediaType}:${hit.tmdbId}`;
      // 먼저 들어온 쪽이 자리를 지키되, 한국어 표기가 있으면 그것을 제목으로 쓴다
      if (!byId.has(key)) byId.set(key, hit);
    }
  }
  const localized = new Map(korean.map((hit) => [`${hit.mediaType}:${hit.tmdbId}`, hit.title]));
  return [...byId].slice(0, 20).map(([key, hit]) => ({ ...hit, title: localized.get(key) || hit.title }));
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
  // TV의 '감독'은 한 자리가 아니다. 미국 드라마는 created_by(제작자)가 그 자리고,
  // 애니메이션에는 created_by가 비어 있는 대신 crew에 Series Director가 있다 —
  // 카우보이 비밥(1998)의 와타나베 신이치로가 그렇게 들어 있다. 그 직책을 보지
  // 않아 "TMDB에 감독 정보가 없다"고 판단하고 넘긴 작품이 여럿이었다.
  //
  // Executive Producer는 맨 뒤다. 드라마 한 편에 열 명 넘게 붙는 자리라
  // 아무나 집으면 엉뚱한 이름이 감독으로 나간다.
  const TV_DIRECTOR_JOBS = ["Series Director", "Creator", "Director", "Executive Producer"];
  const director =
    (isTv
      ? m.created_by?.[0]?.name ||
        TV_DIRECTOR_JOBS.map((job) => crew.find((c) => c.job === job)?.name).find(Boolean)
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
