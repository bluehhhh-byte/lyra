// 콘텐츠 파일 검사 — 이 사이트의 실제 DB는 songs/*.md, movies/*.md,
// data/*.json이다. 깨진 데이터는 빌드·화면을 같이 흔드니 push 전에 잡는다.
//   pnpm lint:data
// 오류(error)만 exit 1. 경고(warn)는 알려만 준다.
// 네트워크 검사 없음(이미지 URL은 형식만) — 빠르고 결정적이어야 게이트로 쓴다.
import { getAllSongs } from "../lib/songs.js";
import { getAllMovies } from "../lib/movies.js";
import { getWatched } from "../lib/watched.js";
import { EMOTIONS } from "../lib/keywords.js";
import { genreTagOf, genreIssue } from "../lib/genre.js";
import { readData } from "../lib/store.js";

const errors = [];
const warns = [];
const err = (f, msg) => errors.push(`${f}: ${msg}`);
const warn = (f, msg) => warns.push({ f, msg });

const isHttps = (u) => /^https:\/\/\S+$/.test(u || "");
const validRating = (r) => Number.isFinite(r) && r >= 0.5 && r <= 5 && r * 2 === Math.round(r * 2);

// ── songs/*.md ──────────────────────────────────────────────────────────────
const songs = getAllSongs();
const songKey = new Map(); // title|artist 중복(같은 곡 두 번 저장) 감지
for (const s of songs) {
  const f = `songs/${s.slug}.md`;
  if (!s.title) err(f, "title 없음");
  if (!s.artist) err(f, "artist 없음");
  if (!["en", "ja", "ko"].includes(s.lang)) err(f, `lang이 en/ja/ko가 아님: "${s.lang}"`);
  if (!isHttps(s.artwork) && !s.artwork_none) warn(f, `artwork가 https URL이 아님: "${s.artwork || ""}"`);
  // year가 깨지면 취향 페이지에 "NaN년대"가 뜬다 — 4자리 숫자만
  if (s.year && !/^\d{4}$/.test(String(s.year))) err(f, `year가 4자리 연도가 아님: "${s.year}"`);
  if (!s.year) warn(f, "year 없음 (시대 분석에서 제외됨)");
  if (s.preview && !isHttps(s.preview)) warn(f, "preview가 https URL이 아님");
  if (s.trackId && !/^\d+$/.test(String(s.trackId))) warn(f, `trackId가 숫자가 아님: "${s.trackId}"`);
  if (!s.tags?.length) warn(f, "tags 비어 있음");
  // 장르 태그는 닫힌 영문 어휘 — 한글 장르("얼터너티브")나 우산 장르가 새면 태그 인덱스가 갈라진다
  else {
    const gi = genreIssue(genreTagOf(s.tags));
    if (gi) warn(f, `장르 태그: ${gi} ("${genreTagOf(s.tags) || "—"}")`);
  }
  // emotion은 닫힌 목록 — 파서(parseEmotion)가 조용히 버리는 값을 여기서 드러낸다
  if (s.emotion && !EMOTIONS.includes(s.emotion)) err(f, `emotion이 목록 밖: "${s.emotion}"`);
  if (!s.emotion) warn(f, "emotion 없음 (admin 키워드·감정 일괄 추출로 채움)");
  if (!s.keywords?.length) warn(f, "keywords 없음");

  // 번역 누락 — en/ja 곡의 가사 줄에는 `>` 번역이 붙어야 한다 (ko는 원문만)
  if (s.lang !== "ko") {
    const lines = s.stanzas.flatMap((st) => st.lines);
    const missing = lines.filter((l) => l.en?.trim() && !l.ko?.trim()).length;
    if (missing) warn(f, `번역 없는 가사 줄 ${missing}개`);
  }

  const key = `${s.title}|${s.artist}`.toLowerCase();
  if (songKey.has(key)) err(f, `중복 곡 (${songKey.get(key)}와 같은 title+artist)`);
  else songKey.set(key, f);
}

// ── movies/*.md ─────────────────────────────────────────────────────────────
const movies = getAllMovies();
const movieTmdb = new Map();
for (const m of movies) {
  const f = `movies/${m.slug}.md`;
  if (!m.title) err(f, "title 없음");
  if (m.media && !["movie", "tv"].includes(m.media)) err(f, `media가 movie/tv가 아님: "${m.media}"`);
  if (m.rating != null && !validRating(m.rating)) err(f, `rating이 0.5~5(0.5 단위)가 아님: ${m.rating}`);
  if (m.year && !/^\d{4}$/.test(String(m.year))) err(f, `year가 4자리 연도가 아님: "${m.year}"`);
  if (!isHttps(m.poster)) warn(f, "poster가 https URL이 아님");
  if (!m.tmdbId) warn(f, "tmdbId 없음 (TMDB 링크·왓챠 임포트 대조 불가)");
  if (!m.year) warn(f, "year 없음");
  if (!m.tags?.length) warn(f, "tags 비어 있음");
  if (m.tmdbId) {
    const id = String(m.tmdbId);
    if (movieTmdb.has(id)) err(f, `tmdbId 중복 (${movieTmdb.get(id)}와 같은 작품)`);
    else movieTmdb.set(id, f);
  }
}

// ── data/watcha-movies.json ─────────────────────────────────────────────────
// TMDB 원본에도 포스터가 없는 작품 — 채울 소스가 없어 의도된 예외 (2026-08 확인).
// CoverImage가 제목 블록으로 표시한다. 새 무포스터 항목은 여기 없으면 경고된다.
const NO_POSTER_OK = new Set(["m5rq1jd", "mpWpv4d", "mOVPreR"]);

const watched = getWatched();
{
  const f = "data/watcha-movies.json";
  const codes = new Map();
  let badRating = 0, badMedia = 0, noPoster = 0, noTmdb = 0;
  for (const [i, m] of watched.entries()) {
    const at = `${f}[${i}] ${m.title || "?"}`;
    if (!m.title) err(at, "title 없음");
    if (!m.code) err(at, "code 없음 (왓챠 별점 병합 키)");
    else if (codes.has(m.code)) err(at, `code 중복 (${codes.get(m.code)})`);
    else codes.set(m.code, m.title);
    if (m.rating != null && !validRating(m.rating)) { badRating++; err(at, `rating 이상: ${m.rating}`); }
    if (m.media && !["movie", "tv"].includes(m.media)) { badMedia++; err(at, `media 이상: "${m.media}"`); }
    if (!m.poster && !NO_POSTER_OK.has(m.code)) noPoster++;
    if (!m.tmdbId) noTmdb++;
  }
  if (noPoster) warn(f, `poster 없는 항목 ${noPoster}개`);
  if (noTmdb) warn(f, `tmdbId 없는 항목 ${noTmdb}개 (외부 링크·인물 병합 제외됨)`);
}

// ── data/song-recs.json · data/taste-recs.json (추천) ───────────────────────
// 추천 파일이 깨져도 사이트는 안 죽지만(빈 배열 fallback), 중복·필드 누락은
// 생성 로직의 회귀 신호라 여기서 잡는다.
{
  const sr = readData("song-recs.json", { items: [] }).items || [];
  const ids = new Set();
  for (const [i, r] of sr.entries()) {
    const at = `data/song-recs.json[${i}] ${r.title || "?"}`;
    if (!r.trackId || !r.title || !r.artist) err(at, "trackId/title/artist 누락");
    else if (ids.has(String(r.trackId))) err(at, "trackId 중복");
    else ids.add(String(r.trackId));
  }
  const mr = readData("taste-recs.json", { items: [] }).items || [];
  const mids = new Set();
  for (const [i, r] of mr.entries()) {
    const at = `data/taste-recs.json[${i}] ${r.title || "?"}`;
    if (!r.tmdbId || !r.title) err(at, "tmdbId/title 누락");
    else if (mids.has(String(r.tmdbId))) err(at, "tmdbId 중복");
    else mids.add(String(r.tmdbId));
  }
}

// ── 결과 ────────────────────────────────────────────────────────────────────
// 경고가 많으면(대량 임포트 직후 등) 파일별 나열 대신 유형별로 묶는다 —
// 400줄 노이즈는 경고를 안 읽게 만든다.
if (warns.length > 30) {
  const groups = new Map();
  for (const w of warns) {
    const key = w.msg.replace(/\d+/g, "N").replace(/"[^"]*"/g, '"…"');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(w.f);
  }
  for (const [key, files] of [...groups].sort((a, b) => b[1].length - a[1].length))
    console.log(`  ⚠ ${key} × ${files.length} (예: ${files[0]})`);
} else {
  for (const w of warns) console.log(`  ⚠ ${w.f}: ${w.msg}`);
}
for (const e of errors) console.log(`  ✗ ${e}`);
console.log(
  `\n곡 ${songs.length} · 영화 ${movies.length} · 왓챠 ${watched.length}` +
  ` — 오류 ${errors.length} · 경고 ${warns.length}`
);
if (errors.length) process.exit(1);
