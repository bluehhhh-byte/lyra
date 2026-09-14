// 인스타그램 캡션 — 크레딧 한 줄, 해시태그, 시각.
//
// 들어오는 캡션을 파싱하는 extractBody(lib/admin/instagram.js)는 기존 게시물을
// 가져올 때만 쓰이므로 이 형식과 무관하다(2026-09-12 확인).
import { WORK_TYPES, APPEARANCE_ROLES } from "./appearance-labels.js";

export const INSTAGRAM_CAPTION_LIMIT = 2200;
export const INSTAGRAM_HASHTAG_LIMIT = 30;

export function captionPreview(value) {
  const text = String(value || "").replace(/\r\n?/g, "\n");
  const characters = [...text].length;
  const lines = text ? text.split("\n").length : 0;
  const hashtags = (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length;
  const warnings = [];
  if (characters > INSTAGRAM_CAPTION_LIMIT)
    warnings.push(`Instagram 캡션 제한을 ${characters - INSTAGRAM_CAPTION_LIMIT}자 초과했습니다.`);
  if (hashtags > INSTAGRAM_HASHTAG_LIMIT)
    warnings.push(`Instagram 해시태그 제한을 ${hashtags - INSTAGRAM_HASHTAG_LIMIT}개 초과했습니다.`);
  return { text, characters, lines, hashtags, warnings };
}

// ── 해시태그 다섯 개 ─────────────────────────────────────────────────────
//
//   #아티스트 #제목 #가사추천 #오늘의노래 #플레이리스트
//
// 앞의 둘은 이 게시물에만 해당하고, 뒤의 셋은 모든 게시물에 같이 붙어 사람이
// 타고 들어오는 길이 된다.
//
// 한때 언어·장르·감정·키워드까지 얹어 스무 개 남짓을 달았다. 태그를 늘릴수록
// 걸릴 확률이 오른다는 계산이었는데, 게시물 아래가 태그 벽이 됐다.
export const HASHTAG_MAX = 5;
const FIXED_SONG_TAGS = ["가사추천", "오늘의노래", "플레이리스트"];
const FIXED_MOVIE_TAGS = ["영화추천", "오늘의영화", "영화기록"];

// 상한에 걸려 잘릴 때는 뒤에서부터 잘린다. 그래서 순서가 곧 우선순위다.
// 사람이 관리자에서 고른 태그(extra)가 고정 셋보다 앞이다 — 고정 셋은 아무도
// 고르지 않았을 때의 기본값이고, 고른 것이 있으면 그쪽이 이 게시물의 뜻이다.
//
// 자리가 남아도(第ゼロ感처럼 제목을 태그로 못 쓰는 곡) 다른 태그로 메우지
// 않는다. 자리를 채우자고 고르지 않은 태그를 넣으면 게시물마다 태그가 달라지고,
// 다섯 개로 줄인 뜻이 사라진다.
export function suggestHashtags(song = {}, { max = HASHTAG_MAX, extra = [], fixed = FIXED_SONG_TAGS } = {}) {
  const ordered = [
    instagramTag(song.artist),
    // 긴 제목·기호투성이 제목은 태그로 쓸모가 없다 — 아무도 그렇게 검색하지 않는다
    taggableTitle(song.title),
    ...extra,
    ...fixed,
  ];
  const seen = new Set();
  const out = [];
  for (const raw of ordered) {
    const tag = instagramTag(raw);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}

// 제목 태그는 곡의 언어를 본다. `#らしさ`는 네 글자라 길이 검사를 통과하지만
// 한국어 계정에서 그 태그를 검색하는 사람은 없다 — 자리만 먹는다. 한국어
// 제목(`#그대는총천연색`)과 라틴 문자 제목(`#Trash`)은 그대로 쓸모가 있다.
const CJK_ONLY = /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{N}\p{P}\s]+$/u;

function taggableTitle(title = "") {
  const text = String(title).trim();
  if (!text || text.length > 20) return "";
  // 한글이 하나도 없고 일본어·한자로만 된 제목은 뺀다
  if (CJK_ONLY.test(text)) return "";
  const tag = instagramTag(text);
  return tag.length >= 2 ? tag : "";
}

// ── 캡션 조립 ────────────────────────────────────────────────────────────
//
// 세 덩어리다: 크레딧 줄 → 해시태그 → 시각.
//
//   | 신해경 - 그대는 총천연색 (2018)
//
//   #신해경 #그대는총천연색 #고독 …
//
//   (260912 21:40)
//
// 한동안 여기에 훅("이럴 때 듣는다")·해설·권유 문구까지 실었다. 캡션이
// 인스타그램에서 색인되는 유일한 텍스트라는 이유였는데, 카드가 이미 그 내용을
// 다 담고 있어 같은 말이 두 번 나갔다. 크레딧 한 줄만 남긴다 — 무슨 곡인지는
// 이미지 없이 캡션만 읽어도 알아야 한다.
//
// 시각은 해시태그가 아니라 본문 괄호다. 예전에는 #260714_1531처럼 태그였고,
// 아무도 검색하지 않는 그것이 30개 예산에서 한 자리를 먹었다.
// 이 곡에만 있는 태그(아티스트·제목·사람이 고른 것)를 윗줄에, 모든 게시물에
// 같이 붙는 고정 셋을 아랫줄에 둔다. 한 줄로 뭉치면 어디까지가 이 곡 얘기인지
// 눈으로 갈리지 않는다.
function tagLines(tags, fixed) {
  const fixedSet = new Set(fixed.map(instagramTag));
  const line = (list) => (list.length ? list.map((tag) => `#${tag}`).join(" ") : "");
  return [line(tags.filter((tag) => !fixedSet.has(tag))), line(tags.filter((tag) => fixedSet.has(tag)))];
}

function assemble({ credit, appearance, tags, stamp }) {
  return [credit && `| ${credit}`, appearance, ...(tags || []), stamp && `(${stamp})`]
    .filter(Boolean)
    .join("\n");
}

// 작품 사용 한 줄. 감독을 모르면 감독 없이 시작한다.
//
//   & 크리스토페르 보르글리, 영화 <더 드라마> 엔딩 (2026) |
//   & 영화 <더 드라마> 엔딩 (2026) |
//
// 유형·역할 라벨은 lib/appearance-labels.js 한 곳에서 온다 — 곡 페이지가 쓰는
// 것과 같은 원본이라 캡션과 화면이 갈리지 않는다. 그 파일이 아무것도 import하지
// 않는 이유가 여기다: 이 함수는 클라이언트 번들에서 돈다.
export function appearanceLine(item) {
  const title = String(item?.workTitle || "").trim();
  if (!title) return "";
  const director = String(item.director_ko || item.director || "").trim();
  const type = WORK_TYPES[item.workType] || WORK_TYPES.movie;
  const role = APPEARANCE_ROLES[item.role] || APPEARANCE_ROLES.other;
  const year = String(item.year || "").trim();
  const head = [director, `${type} <${title}> ${role}`].filter(Boolean).join(", ");
  return `& ${head}${year ? ` (${year})` : ""} |`;
}

// 제목이 이미 괄호로 끝나면 연도를 또 괄호로 붙이지 않는다 —
// "… (Pink Floyd Cover) (2004)"처럼 괄호가 두 번 나와 읽기 나빠진다.
export function creditLine(name, title, year) {
  const head = [String(name || "").trim(), String(title || "").trim()].filter(Boolean).join(" - ");
  if (!head || !year) return head;
  return /\)\s*$/.test(String(title)) ? `${head} · ${year}` : `${head} (${year})`;
}

export function buildCaption(song = {}, now = new Date(), extraTags = []) {
  return assemble({
    credit: creditLine(song.artist, song.title, song.year),
    // 이 곡이 어느 작품에 쓰였는지는 카드가 아니라 캡션에서만 검색된다
    appearance: appearanceLine(song.captionAppearance),
    tags: tagLines(suggestHashtags(song, { extra: extraTags }), FIXED_SONG_TAGS),
    stamp: readableStamp(now),
  });
}

export function buildMovieCaption(movie = {}, now = new Date(), extraTags = []) {
  return assemble({
    credit: creditLine(movie.director, movie.title, movie.year),
    tags: tagLines(
      suggestHashtags({ artist: movie.director, title: movie.title }, { extra: extraTags, fixed: FIXED_MOVIE_TAGS }),
      FIXED_MOVIE_TAGS,
    ),
    stamp: readableStamp(now),
  });
}

export function buildMovieCarouselCaption(preset = {}, now = new Date(), extraTags = []) {
  return assemble({
    // 큐레이션은 한 작품이 아니라 묶음이라 크레딧 대신 헤드라인이 그 자리를 쓴다
    credit: String(preset.headline || "").trim(),
    // 묶음에는 감독도 제목도 없다. 계정 표식이 그 첫 자리를 대신 쓴다.
    tags: tagLines(
      suggestHashtags({ artist: "Cyno" }, { extra: extraTags, fixed: FIXED_MOVIE_TAGS }),
      FIXED_MOVIE_TAGS,
    ),
    stamp: readableStamp(now),
  });
}

// 영화 캐러셀 관리자에만 남은 쓰임 — 사람이 고른 세트의 태그가 extraTags로
// 들어간다. 곡 페이지는 태그를 자동으로 채우지 않으므로 세트를 읽지 않는다.
export function hashtagSetsFor(dataset = {}, kind) {
  return (dataset.sets || [])
    .filter((set) => set?.id && set?.label && set?.kind === kind)
    .map((set) => ({
      id: String(set.id),
      label: String(set.label),
      tags: [...new Set((set.tags || []).map(instagramTag).filter(Boolean))],
    }));
}

// 해시태그가 아니라 읽는 날짜. 게시 시각을 남기던 관행은 유지하되 태그
// 예산은 쓰지 않는다.
function readableStamp(now) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${p(now.getFullYear() % 100)}${p(now.getMonth() + 1)}${p(now.getDate())} ` +
    `${p(now.getHours())}:${p(now.getMinutes())}`
  );
}

export function instagramTag(value = "") {
  // Instagram cuts a hashtag at the first space/punctuation — keep only letters
  // and digits (Korean/Japanese/Latin) so the whole name stays in one tag.
  return String(value ?? "").replace(/[^\p{L}\p{N}_]/gu, "");
}
