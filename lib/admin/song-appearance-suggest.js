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
const WEAK_SOURCE_HOST = /(^|\.)(wikipedia\.org|reddit\.com|fandom\.com|namu\.wiki|blogspot\.com|tiktok\.com|instagram\.com|facebook\.com|x\.com|twitter\.com|youtube\.com|youtu\.be)$/i;
const IRRELEVANT_SOURCE_HOST = /(^|\.)(stackoverflow\.com|stackexchange\.com|superuser\.com|serverfault\.com|answers\.microsoft\.com|support\.microsoft\.com|justanswer\.com|tenforums\.com|askamanager\.org|quora\.com)$/i;

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

function canonicalUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (!/^https?:$/.test(url.protocol)) return "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return "";
  }
}

function sourceQuality(source) {
  let hostname = "";
  try { hostname = new URL(source.uri).hostname.replace(/^www\./, ""); } catch {}
  if (IRRELEVANT_SOURCE_HOST.test(hostname)) return "irrelevant";
  if (!hostname || WEAK_SOURCE_HOST.test(hostname)) return "community";
  if (/official|공식|オフィシャル|discograph|label|records|studio|network|broadcast|distribution/i.test(`${source.title} ${hostname}`))
    return "primary";
  return "editorial";
}

const identityText = (value) => cleanLine(value, 300).toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function sourceSupportsSong(source, identity = {}) {
  if (!source || source.quality === "irrelevant") return false;
  // 공식 사운드트랙·제작사 페이지는 문서 제목이 "Official Soundtrack"처럼
  // 일반적일 수 있다. 실제 grounding URL과 evidenceClaim까지 일치한 primary는
  // 허용하되, 일반 편집 매체는 아래의 곡·아티스트·작품명 일치를 요구한다.
  if (source.quality === "primary") return true;
  let urlText = "";
  try {
    const parsed = new URL(source.uri);
    urlText = `${parsed.hostname} ${decodeURIComponent(parsed.pathname)}`;
  } catch {}
  const haystack = identityText(`${source.title || ""} ${urlText}`);
  const identifiers = [identity.title, identity.artist, identity.album, identity.workTitle, identity.originalTitle]
    .map(identityText)
    .filter((value) => value.length >= 2);
  return identifiers.some((value) => haystack.includes(value));
}

async function durableSource(value) {
  const original = canonicalUrl(value?.uri);
  if (!original) return null;
  let hostname = "";
  try { hostname = new URL(original).hostname; } catch {}
  if (!/grounding-api-redirect|vertexaisearch/i.test(hostname)) return { ...value, uri: original };
  try {
    const response = await fetch(original, {
      redirect: "follow",
      headers: { "User-Agent": "LyraResearch/1.0" },
      signal: AbortSignal.timeout(5_000),
    });
    const resolved = canonicalUrl(response.url);
    response.body?.cancel?.().catch?.(() => {});
    return { ...value, uri: resolved && !/grounding-api-redirect|vertexaisearch/i.test(resolved) ? resolved : original, groundingUri: original };
  } catch {
    return { ...value, uri: original };
  }
}

async function normalizeSources(values) {
  const seen = new Set();
  const sources = [];
  const durable = await Promise.all((values || []).slice(0, 8).map(durableSource));
  for (const value of durable) {
    if (!value) continue;
    const uri = canonicalUrl(value?.uri);
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    const source = { uri, title: cleanLine(value.title || "웹 검색 결과", 240) };
    sources.push({ ...source, quality: sourceQuality(source) });
  }
  return sources;
}

function exactSource(sources, requested) {
  const key = canonicalUrl(requested);
  return key ? sources.find((source) => canonicalUrl(source.uri) === key) || null : null;
}

function normalizeAppearance(parsed, sources, songIdentity) {
  if (parsed?.found !== true) return { appearance: null, state: "not_found", warning: "" };
  if (parsed.conflict === true)
    return { appearance: null, state: "needs_review", warning: "작품 사용 방식에 관해 출처가 충돌해 자동 입력하지 않았습니다." };
  if (!String(parsed.workTitle || "").trim())
    return { appearance: null, state: "needs_review", warning: "작품명이 확인되지 않아 자동 입력하지 않았습니다." };

  // Never replace a hallucinated evidence URL with an unrelated grounded URL.
  // The selected URL must be the same source Gemini actually grounded.
  const source = exactSource(sources, parsed.evidenceUrl);
  if (!source)
    return { appearance: null, state: "needs_review", warning: "모델이 지정한 작품 근거가 실제 검색 출처와 일치하지 않아 자동 입력하지 않았습니다." };
  if (source.quality === "community")
    return { appearance: null, state: "needs_review", warning: "팬 위키·커뮤니티 자료만 확인되어 작품 정보를 자동 확정하지 않았습니다." };
  if (!sourceSupportsSong(source, { ...songIdentity, workTitle: parsed.workTitle, originalTitle: parsed.originalTitle }))
    return { appearance: null, state: "needs_review", warning: "근거 페이지 제목에서 곡·아티스트·작품 식별자를 확인하지 못해 자동 입력하지 않았습니다." };
  if (!cleanLine(parsed.evidenceClaim, 300))
    return { appearance: null, state: "needs_review", warning: "곡과 작품의 관계를 직접 설명하는 근거 문구가 없어 자동 입력하지 않았습니다." };

  const workType = WORK_TYPES.has(parsed.workType) ? parsed.workType : "movie";
  return {
    state: "verified",
    warning: "",
    appearance: {
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
      evidenceClaim: cleanLine(parsed.evidenceClaim, 300),
      status: "verified",
    },
  };
}

function normalizeComment(parsed, sources, songIdentity) {
  const comment = cleanLine(parsed?.comment, 700);
  if (!comment) return { comment: "", basis: "", sources: [], warning: "코멘트가 생성되지 않았습니다." };
  if (parsed.commentBasis === "lyrics_only")
    return { comment, basis: "lyrics_only", sources: [], warning: "" };
  if (parsed.commentBasis !== "web_enriched")
    return { comment: "", basis: "", sources: [], warning: "코멘트가 가사 해석인지 웹 사실 기반인지 구분되지 않아 반영하지 않았습니다." };

  const matched = [];
  for (const url of Array.isArray(parsed.commentEvidenceUrls) ? parsed.commentEvidenceUrls : []) {
    const source = exactSource(sources, url);
    if (source && source.quality !== "community" && sourceSupportsSong(source, songIdentity) && !matched.some((item) => item.uri === source.uri)) matched.push(source);
  }
  if (!matched.length)
    return { comment: "", basis: "", sources: [], warning: "웹 사실이 포함된 코멘트의 직접 근거가 검색 출처와 일치하지 않아 반영하지 않았습니다." };
  return { comment, basis: "web_enriched", sources: matched.slice(0, 3), warning: "" };
}

// One grounded call owns both prose and structured appearance data. It also
// returns durable, exact-match provenance for the prose. Lyrics-only criticism
// remains possible when the web has nothing useful, without pretending that
// the lyrics supplied by the editor are a web source.
export async function researchSongContext({ key, title, artist, album, year, genre, lyrics, commentHint }) {
  if (!key || !String(title || "").trim() || !String(artist || "").trim()) return null;

  const titleVariant = String(title).replace(/[〜～~‐‑‒–—-]+/g, " ").replace(/\s+/g, " ").trim();
  const result = await geminiGrounded(
    key,
    `웹 검색을 사용해 정확한 녹음 "${title}" — ${artist}를 조사해라.
먼저 따옴표로 묶은 곡명+아티스트, 구두점을 단순화한 "${titleVariant}"+아티스트를 검색해 동명 곡·커버·재녹음을 배제해라.
작품 사용은 soundtrack/OST/theme/insert song/tie-up/タイアップ/主題歌/挿入歌/サウンドトラック을 조합해 찾고, 곡 해설은 review/interview/making of/liner notes/제작 배경/인터뷰/당시 상황도 원어와 영어로 찾아라.
${album ? `앨범: ${album}` : ""}${year ? `\n발매 연도: ${year}` : ""}${genre ? `\n장르 참고: ${genre}` : ""}
${commentHint ? `기존 AI 코멘트의 후보 단서(사실로 간주하지 말고 웹에서 다시 검증): ${cleanLine(commentHint, 600)}` : ""}

리서치 원칙:
- 공식 아티스트·제작사·배급사·방송사·음반사·OST·라이너 노트를 최우선으로 하고, 신뢰할 수 있는 음악·영화 매체의 평과 인터뷰를 다음으로 쓴다.
- 검색 결과 제목만 읽지 말고 실제 페이지에서 곡명과 아티스트, 주장한 관계가 함께 확인되는 출처만 채택한다.
- 코멘트는 가사의 구체적인 이미지와 음악적 인상을 중심에 둔다. 제작 배경·당시 아티스트 상황·평가·작품 사용 정보는 해석을 깊게 할 때만 자연스럽게 보탠다.
- 외부 사실을 한 가지라도 쓰면 commentBasis="web_enriched"이고, 그 사실을 직접 뒷받침한 실제 URL만 commentEvidenceUrls에 넣는다. 가사와 음악적 인상만 쓰면 commentBasis="lyrics_only", commentEvidenceUrls=[]다.
- 기존 코멘트와 모델 기억은 근거가 아니다. 팬 위키·커뮤니티·SNS만으로 작품 연결을 확정하지 마라.
- 작품 사용은 곡과 아티스트가 모두 일치하고 관계를 명시한 근거가 있을 때만 found=true다. 공식 사운드트랙 수록, 주제가, 삽입곡, 예고편 사용을 서로 같은 뜻으로 바꾸지 마라.
- 신뢰할 만한 출처끼리 작품·역할·연도가 다르거나 동일 녹음인지 불명확하면 appearance.conflict=true로 두고 억지로 결론내리지 마라.
- evidenceUrl은 evidenceClaim(곡과 작품의 직접 관계를 짧게 요약)을 실제로 뒷받침한 출처 주소여야 한다.
- appearance.role은 main_theme|opening|ending|insert_song|background|trailer|character_song|other 중 하나다.
- appearance.workType은 movie|drama|anime_movie|anime_series 중 하나다.
- 한국어 1~2문장, 담백한 개인 음악 평론의 '~다'체로 쓴다.

가사 원문:
${String(lyrics || "").trim().slice(0, 2200) || "(원문 없음 — 가사 내용을 지어내지 마라)"}

설명 없이 JSON 한 개만 출력:
{"comment":"...","commentBasis":"lyrics_only|web_enriched","commentEvidenceUrls":["https://..."],"appearance":{"found":true|false,"conflict":false,"workTitle":"","originalTitle":"","workType":"movie","role":"insert_song","year":2022,"season":null,"episode":null,"note":"","evidenceClaim":"곡과 작품의 직접 관계","evidenceUrl":"https://..."}}`
  );
  if (!result?.text) return null;

  let parsed;
  try {
    parsed = JSON.parse(jsonObject(result.text));
  } catch {
    return null;
  }

  const sources = await normalizeSources(result.sources);
  const appearanceValue = parsed.appearance && typeof parsed.appearance === "object" ? parsed.appearance : parsed;
  const songIdentity = { title, artist, album };
  const appearanceResult = normalizeAppearance(appearanceValue, sources, songIdentity);
  const commentResult = normalizeComment(parsed, sources, songIdentity);
  const warnings = [commentResult.warning, appearanceResult.warning].filter(Boolean);
  const appearance = appearanceResult.appearance ? {
    ...appearanceResult.appearance,
    searchQueries: result.queries || [],
    searchEntryPoint: result.searchEntryPoint || "",
  } : null;

  return {
    comment: commentResult.comment,
    commentBasis: commentResult.basis,
    commentSources: commentResult.sources,
    appearance,
    appearanceState: appearanceResult.state,
    warning: warnings.join(" "),
    sources,
    searchQueries: result.queries || [],
    searchEntryPoint: result.searchEntryPoint || "",
  };
}

export async function suggestSongAppearance(input) {
  const research = await researchSongContext(input);
  return research?.appearance || null;
}
