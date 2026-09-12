// 인스타그램 캡션 — 해시태그와 시각뿐이다.
//
// 들어오는 캡션을 파싱하는 extractBody(lib/admin/instagram.js)는 기존 게시물을
// 가져올 때만 쓰이므로 이 형식과 무관하다(2026-09-12 확인).
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

// ── 해시태그 3층 ─────────────────────────────────────────────────────────
//
// 대형: 이 계정을 처음 보는 사람이 타고 들어오는 넓은 태그.
// 맥락: 언어·장르 — 같은 취향을 찾는 사람에게 걸린다.
// 정확: 이 곡에만 해당하는 것(아티스트·제목·감정·키워드). 경쟁이 없어 상위에 남는다.
//
// 셋을 섞는 이유는 넓은 태그만 쓰면 몇 초 만에 묻히고, 좁은 태그만 쓰면
// 아무도 안 보기 때문이다.
const LANG_TAGS = {
  ko: ["한국노래", "가사스타그램"],
  en: ["팝송가사", "영어가사"],
  ja: ["일본노래", "일본어가사"],
};

// 장르 → 태그. 사이트의 장르 어휘(lib/genre.js GENRES)에서 실제로 쓰이는
// 것만 골랐다. 없는 장르는 조용히 건너뛴다 — 억지로 만들면 아무도 안 쓰는
// 태그가 된다.
const GENRE_TAGS = {
  "Indie Rock": ["인디음악", "인디록"],
  "Indie Pop": ["인디음악", "인디팝"],
  "Dream Pop": ["드림팝"],
  Shoegaze: ["슈게이즈"],
  "J-Rock": ["제이록"],
  "J-Pop": ["제이팝"],
  "K-Pop": ["케이팝"],
  Ballad: ["발라드"],
  "R&B/Soul": ["알앤비"],
  "Hip-Hop": ["힙합"],
  Metal: ["메탈"],
  Rock: ["록음악"],
  Pop: ["팝송"],
  Jazz: ["재즈"],
  Folk: ["포크"],
  Electronic: ["일렉트로닉"],
  "City Pop": ["시티팝"],
};

const MAX_KEYWORD_TAGS = 2;

export function suggestHashtags(song = {}, { sets = [], max = INSTAGRAM_HASHTAG_LIMIT, extra = [] } = {}) {
  const broad = sets.flatMap((set) => set.tags || []);
  const context = [
    ...(LANG_TAGS[song.lang] || []),
    ...(GENRE_TAGS[song.genre] || []),
  ];
  const precise = [
    instagramTag(song.artist),
    // 긴 제목·기호투성이 제목은 태그로 쓸모가 없다 — 아무도 그렇게 검색하지 않는다
    taggableTitle(song.title),
    song.emotion || "",
    ...(song.keywords || []).slice(0, MAX_KEYWORD_TAGS),
  ];

  // 정확층을 먼저 넣는다. 상한에 걸려 잘릴 때 잘리는 쪽은 넓은 태그여야 한다 —
  // 그건 다른 게시물에도 있지만 이 곡의 감정·키워드는 여기에만 있다.
  const ordered = [...precise, ...context, ...extra, ...broad];
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
// 캡션은 해시태그와 시각뿐이다.
//
// 한동안 훅("이럴 때 듣는다")·해설·곡 정보·권유 문구를 함께 실었다. 캡션이
// 인스타그램에서 색인되는 유일한 텍스트라 사이트가 가진 것을 흘려보내지 말자는
// 생각이었는데, 그 결과 게시물이 설명문이 됐다. 카드가 이미 제목·아티스트·
// 가사·해설을 다 담고 있어서 같은 말이 두 번 나오기도 했다.
//
// 시각은 해시태그가 아니라 본문 괄호로 남긴다 — 예전에는 #260714_1531처럼
// 태그였고, 아무도 검색하지 않는 그것이 30개 예산에서 한 자리를 먹었다.
function assemble({ tags, stamp }) {
  return [tags && tags.map((tag) => `#${tag}`).join(" "), stamp && `(${stamp})`]
    .filter(Boolean)
    .join("\n\n");
}

export function buildCaption(song = {}, now = new Date(), extraTags = [], { sets = [] } = {}) {
  return assemble({
    tags: suggestHashtags(song, { sets, extra: extraTags }),
    stamp: readableStamp(now),
  });
}

export function buildMovieCaption(movie = {}, now = new Date(), extraTags = [], { sets = [] } = {}) {
  return assemble({
    tags: suggestHashtags(
      { artist: movie.director, title: movie.title, genre: movie.genre, emotion: movie.emotion, keywords: movie.themes },
      { sets, extra: ["영화로그", ...extraTags] },
    ),
    stamp: readableStamp(now),
  });
}

export function buildMovieCarouselCaption(preset = {}, now = new Date(), extraTags = [], { sets = [] } = {}) {
  return assemble({
    tags: suggestHashtags({}, { sets, extra: ["Cyno", "영화로그", ...extraTags] }),
    stamp: readableStamp(now),
  });
}

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
