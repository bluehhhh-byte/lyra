// TMDB 상세 페이지 URL. media가 "tv"면 /tv/, 아니면 /movie/ — 왓챠 데이터셋
// 1045편 중 64편이 드라마라 /movie/ 하드코딩은 틀린 페이지로 보낸다.
// lib/tmdb.js(서버 전용, API 키)와 달리 클라이언트 컴포넌트에서도 안전.
export const tmdbUrl = (tmdbId, media) =>
  tmdbId ? `https://www.themoviedb.org/${media === "tv" ? "tv" : "movie"}/${tmdbId}` : null;
