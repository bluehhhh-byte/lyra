import { geminiGrounded } from "./gemini.js";

const WORK_TYPES = new Set(["movie", "drama", "anime_movie", "anime_series"]);
const ROLES = new Set([
  "main_theme",
  "opening",
  "ending",
  "insert_song",
  "background",
  "trailer",
  "character_song",
  "other",
]);

const jsonObject = (value) => {
  const text = String(value || "").replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
};
const optionalInteger = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
};
const cleanLine = (value, max = 500) =>
  String(value || "").replace(/\s*\n+\s*/g, " ").replace(/^["']|["']$/g, "").trim().slice(0, max);
const token = (value) => String(value || "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龯]/g, "");

function evidenceScore(source, { title, artist, workTitle }) {
  const haystack = token(`${source.title} ${source.uri}`);
  let score = 0;
  for (const value of [title, artist, workTitle]) {
    const needle = token(value);
    if (needle && haystack.includes(needle)) score += 4;
  }
  if (/official|공식|オフィシャル|disco|soundtrack|ost|music|movie|film/i.test(`${source.title} ${source.uri}`)) score += 2;
  if (/wikipedia|reddit|blogspot|fandom|namu\.wiki/i.test(source.uri)) score -= 5;
  return score;
}

function pickEvidence(sources, appearance, song) {
  const requested = String(appearance?.evidenceUrl || "").trim();
  const exact = requested && sources.find((source) => source.uri === requested);
  if (exact) return exact;
  return [...sources].sort((a, b) =>
    evidenceScore(b, { ...song, workTitle: appearance?.workTitle }) -
    evidenceScore(a, { ...song, workTitle: appearance?.workTitle })
  )[0];
}

function normalizeAppearance(parsed, sources, song) {
  if (parsed?.found !== true || !String(parsed.workTitle || "").trim() || !sources.length) return null;
  const source = pickEvidence(sources, parsed, song);
  if (!source) return null;
  const workType = WORK_TYPES.has(parsed.workType) ? parsed.workType : "movie";
  return {
    workTitle: cleanLine(parsed.workTitle, 200),
    originalTitle: cleanLine(parsed.originalTitle, 200),
    workType,
    mediaType: workType === "drama" || workType === "anime_series" ? "tv" : "movie",
    role: ROLES.has(parsed.role) ? parsed.role : "other",
    year: optionalInteger(parsed.year),
    season: optionalInteger(parsed.season),
    episode: optionalInteger(parsed.episode),
    note: cleanLine(parsed.note, 500),
    evidenceUrl: source.uri,
    evidenceLabel: source.title,
    status: "verified",
  };
}

// One grounded call owns both prose and structured appearance data. Previously
// `computeAuto` invented a comment from model memory while a parallel appearance
// lookup could fail independently; the UI then showed Godzilla in prose and an
// empty appearance form. A shared result makes those two representations agree.
export async function researchSongContext({ key, title, artist, album, year, genre, lyrics, commentHint }) {
  if (!key || !String(title || "").trim() || !String(artist || "").trim()) return null;

  const titleVariant = String(title).replace(/[〜～~‐‑‒–—-]+/g, " ").replace(/\s+/g, " ").trim();
  const result = await geminiGrounded(
    key,
    `웹 검색을 사용해 정확한 녹음 "${title}" — ${artist}를 조사해라.
검색할 때 원제뿐 아니라 구두점을 단순화한 "${titleVariant}"도 쓰고, soundtrack/OST/theme/insert song/tie-up/タイアップ/主題歌/挿入歌/サウンドトラック을 아티스트명과 조합해 확인해라.
${album ? `앨범: ${album}` : ""}${year ? `\n발매 연도: ${year}` : ""}${genre ? `\n장르 참고: ${genre}` : ""}
${commentHint ? `기존 AI 코멘트의 후보 단서(사실로 간주하지 말고 웹에서 다시 검증): ${cleanLine(commentHint, 600)}` : ""}

리서치 원칙:
- 공식 아티스트·제작사·배급사·방송사·음반사 페이지, 공식 OST 목록, 신뢰할 수 있는 음악·영화 매체의 평과 인터뷰를 우선한다.
- 코멘트는 아래 가사의 구체적인 이미지와 음악적 인상을 중심에 두고, 확인된 제작 배경·당시 아티스트 상황·평가·작품 사용 정보가 해석을 실제로 깊게 할 때만 자연스럽게 보탠다.
- 외부 사실은 웹 근거가 확인된 것만 쓴다. 기존 코멘트와 모델의 기억은 근거가 아니다.
- 홍보문이나 정보 나열이 아니라 개인 음악 블로그의 짧은 평론처럼 한국어 1~2문장, 담백한 '~다'체로 쓴다.
- 작품 사용은 곡과 아티스트가 모두 일치하고 관계를 명시한 근거가 있을 때만 found=true다. 같은 제목의 다른 녹음·커버·리메이크와 혼동하지 마라.
- '공식 사운드트랙 수록', '주제가', '삽입곡', '예고편 사용'을 서로 같은 뜻으로 바꾸지 말고 근거의 표현에 맞춰 role을 정한다.
- appearance.role은 main_theme|opening|ending|insert_song|background|trailer|character_song|other 중 하나다.
- appearance.workType은 movie|drama|anime_movie|anime_series 중 하나다.
- evidenceUrl은 실제로 참고한 가장 직접적인 출처 주소를 넣는다.

가사 원문:
${String(lyrics || "").trim().slice(0, 2200) || "(원문 없음 — 가사 내용을 지어내지 마라)"}

설명 없이 JSON 한 개만 출력:
{"comment":"...","appearance":{"found":true|false,"workTitle":"","originalTitle":"","workType":"movie","role":"insert_song","year":2022,"season":null,"episode":null,"note":"","evidenceUrl":"https://..."}}`
  );
  if (!result?.text) return null;

  let parsed;
  try {
    parsed = JSON.parse(jsonObject(result.text));
  } catch {
    // A malformed grounded response is a lookup failure, not evidence that the
    // song has no screen appearance. Let the API/UI expose it as retryable.
    return null;
  }

  const sources = result.sources || [];
  // Backward-compatible top-level appearance shape keeps old clients/tests and
  // makes a partial model response harmless.
  const appearanceValue = parsed.appearance && typeof parsed.appearance === "object" ? parsed.appearance : parsed;
  const hasExternalClaims = Boolean(cleanLine(parsed.comment)) || appearanceValue?.found === true;
  if (hasExternalClaims && !sources.length) return null;
  const appearance = normalizeAppearance(appearanceValue, sources, { title, artist });
  const comment = sources.length ? cleanLine(parsed.comment, 700) : "";
  return {
    comment,
    appearance: appearance ? {
      ...appearance,
      searchQueries: result.queries || [],
      searchEntryPoint: result.searchEntryPoint || "",
    } : null,
    sources,
    searchQueries: result.queries || [],
    searchEntryPoint: result.searchEntryPoint || "",
  };
}

export async function suggestSongAppearance(input) {
  const research = await researchSongContext(input);
  return research?.appearance || null;
}
