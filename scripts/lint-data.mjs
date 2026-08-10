// 콘텐츠 파일 검사 — 이 사이트의 실제 DB는 songs/*.md, movies/*.md,
// data/*.json이다. 깨진 데이터는 빌드·화면을 같이 흔드니 push 전에 잡는다.
//   pnpm lint:data
// 오류(error)만 exit 1. 경고(warn)는 알려만 준다.
// 네트워크 검사 없음(이미지 URL은 형식만) — 빠르고 결정적이어야 게이트로 쓴다.
import { getAllSongs } from "../lib/songs.js";
import { getAllMovies } from "../lib/movies.js";
import { getWatched } from "../lib/watched.js";
import { EMOTIONS } from "../lib/keywords.js";

const errors = [];
const warns = [];
const err = (f, msg) => errors.push(`${f}: ${msg}`);
const warn = (f, msg) => warns.push(`${f}: ${msg}`);

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
  if (!isHttps(s.artwork)) warn(f, `artwork가 https URL이 아님: "${s.artwork || ""}"`);
  if (!s.tags?.length) warn(f, "tags 비어 있음");
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
    if (!m.poster) noPoster++;
    if (!m.tmdbId) noTmdb++;
  }
  if (noPoster) warn(f, `poster 없는 항목 ${noPoster}개`);
  if (noTmdb) warn(f, `tmdbId 없는 항목 ${noTmdb}개 (외부 링크·인물 병합 제외됨)`);
}

// ── 결과 ────────────────────────────────────────────────────────────────────
for (const w of warns) console.log(`  ⚠ ${w}`);
for (const e of errors) console.log(`  ✗ ${e}`);
console.log(
  `\n곡 ${songs.length} · 영화 ${movies.length} · 왓챠 ${watched.length}` +
  ` — 오류 ${errors.length} · 경고 ${warns.length}`
);
if (errors.length) process.exit(1);
