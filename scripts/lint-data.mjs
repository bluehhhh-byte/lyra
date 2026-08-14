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
  // 모순: '커버 없음 확정'인데 artwork가 있으면 둘 중 하나는 거짓
  if (s.artwork_none && isHttps(s.artwork)) err(f, "artwork_none인데 artwork가 있음");
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

  // 번역 누락 — en/ja 곡의 가사 줄에는 `>` 번역이 붙어야 한다 (ko는 원문만).
  // `>^N`으로 아래 줄 번역이 덮는 줄(koMerged)은 누락이 아니다.
  const lines = s.stanzas.flatMap((st) => st.lines);
  if (s.lang !== "ko") {
    // 세지 않는 줄: 🗨·✏로 시작하는 본인 해설, 그리고 이미 한글인 줄
    // (외국어 곡 안의 한국어 가사이거나 표시가 빠진 번역이다 — 어느 쪽이든
    //  한글 번역을 새로 붙일 대상이 아니다)
    const missing = lines.filter((l) => {
      const t = l.en?.trim();
      if (!t || l.ko?.trim() || l.koMerged) return false;
      if (/^[🗨✏]/u.test(t)) return false;
      const ko = (t.match(/[가-힣]/g) || []).length;
      return ko < 2 || (t.match(/[a-zA-Z぀-ヿ一-鿿]/g) || []).length >= ko;
    }).length;
    if (missing) warn(f, `번역 없는 가사 줄 ${missing}개`);
  }
  // 가사 없이 해설만 있는 곡 — 캡션에 가사를 안 적었거나 연주곡이다.
  // 화면에는 노트만 뜨므로 어느 쪽인지 사람이 확인해 채우거나 표시해야 한다.
  if (!lines.some((l) => l.en?.trim() || l.ko?.trim())) warn(f, "가사 줄 없음 (해설만 있음 — 연주곡이거나 가사 미기입)");

  // `>^N`이 문단 밖까지 가리키면 어느 줄을 덮는지가 불분명하다 — 조용히 넘기지 않는다
  const overflow = lines.filter((l) => l.koSpanError).length;
  if (overflow) err(f, `>^N 범위가 문단을 넘어감 ${overflow}곳`);

  // ── 가사 정확성 회귀 검사 ────────────────────────────────────────────────
  // 원문 없이 번역만 떠 있는 줄 — 파서가 붙일 원문을 못 찾았다는 뜻이다.
  // 화면에는 번역만 나와 어느 구절인지 알 수 없다.
  const orphan = lines.filter((l) => !l.en?.trim() && l.ko?.trim()).length;
  if (orphan) err(f, `원문 없이 번역만 있는 줄 ${orphan}개 (붙일 원문을 못 찾음)`);

  // 번역이 원문과 글자까지 같으면 번역이 아니라 복사다
  const echo = lines.filter((l) => l.en?.trim() && l.ko?.trim() && l.en.trim() === l.ko.trim()).length;
  if (echo) warn(f, `번역이 원문과 동일한 줄 ${echo}개`);

  // 같은 원문 줄에 서로 다른 번역이 붙어 있으면 후렴 하나가 두 가지로 읽힌다.
  // (의도한 변주일 수 있어 경고 — 감사 화면에서 확인한다)
  const byLine = new Map();
  for (const l of lines) {
    const k = l.en?.trim();
    if (!k || !l.ko?.trim()) continue;
    if (!byLine.has(k)) byLine.set(k, new Set());
    byLine.get(k).add(l.ko.trim());
  }
  const split = [...byLine.values()].filter((v) => v.size > 1).length;
  if (split) warn(f, `같은 원문에 다른 번역이 붙은 구절 ${split}개`);

  // 캡션 흔적이 가사에 남은 경우 — 해시태그, 날짜 태그, 연도만 있는 줄
  const leak = lines.filter((l) => {
    const t = (l.en || "").trim();
    return /#\S/.test(t) || /^\(?\d{4}\)?$/.test(t) || /^\d{6}_\d{4}$/.test(t);
  }).length;
  if (leak) warn(f, `가사에 캡션 흔적(해시태그·연도·날짜 태그) ${leak}줄`);

  // 검증 기록이 있으면 근거가 있어야 한다 — 근거 없는 '확인함'은 확인이 아니다
  if (s.lyrics_verified_at && !s.lyrics_source) err(f, "lyrics_verified_at이 있는데 lyrics_source(근거 URL) 없음");
  if (s.lyrics_source && !/^https?:\/\//.test(s.lyrics_source)) err(f, `lyrics_source가 URL이 아님: "${s.lyrics_source}"`);
  // 캡션에 가사가 없어 밖에서 가져온 곡 — 어디서 가져왔는지가 없으면 대조할 수 없다
  if (s.lyrics_external && !s.lyrics_source) err(f, "lyrics_external인데 lyrics_source(가사 출처 URL) 없음");

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
