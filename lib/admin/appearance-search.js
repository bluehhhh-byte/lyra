// 수록 정보 후보를 무료 소스에서 찾는다 — Gemini 그라운딩 없이.
//
// 왜: 무료 티어에서 Google Search 그라운딩이 막혔고 기다려도 풀리지 않는다
// (CLAUDE.md '함정'). 그라운딩이 하던 일은 둘이었다 — 웹을 검색하고, 답을
// 뽑는 것. 막힌 것은 검색뿐이고 일반 Gemini 호출은 멀쩡하므로, 검색만 갈아
// 끼우면 기능이 돌아온다.
//
// 두 소스를 쓴다. 서로 다른 곳을 덮기 때문이다:
//   iTunes  — 사운드트랙 앨범에 수록된 곡. 한국 드라마·영화 OST가 여기 다 있다.
//             앨범명이 작품명을 그대로 담고("또 오해영 (Original Television
//             Soundtrack)"), Apple Music 페이지가 그대로 근거 URL이 된다.
//   위키백과 — 아티스트 자기 앨범으로 낸 타이업. 일본 애니·영화 주제가가 이쪽이다.
//             OST 앨범이 없으니 iTunes로는 영영 안 잡힌다.
//
// 여기서는 후보와 근거 URL만 모은다. 무엇이 맞는지 고르고 역할(주제가·삽입곡)을
// 정하는 것은 호출부가 일반 Gemini로 한다 — 이 파일은 추측하지 않는다.

const ITUNES_ENDPOINT = "https://itunes.apple.com/search";
// 위키백과는 연락처 없는 User-Agent를 차단한다
const WIKI_UA = "LyraArchive/1.0 (personal music archive; https://lyracyno.vercel.app)";

// 앨범명이 스스로 사운드트랙임을 밝히는 말. 한·영·일 표기를 모두 본다.
const OST_MARK =
  /(original\s+(motion\s+picture\s+)?(television\s+|series\s+|movie\s+)?soundtrack|music\s+from\s+the\s+motion\s+picture|original\s+score|\bO\.?S\.?T\.?\b|오리지널\s*사운드트랙|사운드트랙|オリジナル・?サウンドトラック|サントラ)/i;

// 앨범명에서 작품명만 남긴다 — "또 오해영 (Original Television Soundtrack), Pt. 2"
// 에서 "또 오해영"을 꺼낸다. 꼬리표를 떼지 않으면 작품명 대조가 전부 빗나간다.
const ALBUM_NOISE = /soundtrack|score|\bost\b|사운드트랙|サウンドトラック|サントラ|special edition|deluxe|remaster|pt\.?\s*\d+|part\s*\d+/i;

export function workTitleFromAlbum(album = "") {
  let text = String(album);
  // 괄호 덩어리는 통째로 뗀다. 안의 글자만 지우면 "[ ]"가 남는다.
  text = text.replace(/[([][^()[\]]*[)\]]/g, (group) => (ALBUM_NOISE.test(group) ? " " : group));
  text = text.replace(/\b(pt\.?|part)\s*\d+\b/gi, " ");
  text = text.replace(/[-–—]\s*(single|ep)\s*$/i, " ");
  text = text.replace(/\b(special edition|deluxe)\b/gi, " ");
  return text.replace(/\s{2,}/g, " ").trim().replace(/[,·\s]+$/, "");
}

export const normalizeTitle = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[\s'’"“”·・~〜\-–—_:,.!?()[\]『』「」]/g, "");

// 검색 결과에 다른 곡이 섞여 들어오면 그 곡의 OST를 이 곡의 것으로 읽게 된다.
// 다만 완전히 같기를 요구하면 "이상기후 (Feat. …)" 같은 표기 차이에 다 걸린다.
export function sameRecording(candidate, title) {
  const got = normalizeTitle(candidate);
  const want = normalizeTitle(title);
  if (!got || !want) return false;
  return got.includes(want) || want.includes(got);
}

export async function itunesAppearanceCandidates(artist, title, { fetchImpl = fetch, timeoutMs = 12_000 } = {}) {
  const term = `${artist} ${title}`.trim();
  if (!term) return [];
  const url = `${ITUNES_ENDPOINT}?term=${encodeURIComponent(term)}&entity=song&limit=50`;
  let json;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return [];
    json = await res.json();
  } catch {
    return [];
  }
  const out = new Map();
  for (const row of json?.results || []) {
    if (!sameRecording(row.trackName, title)) continue;
    const album = String(row.collectionName || "");
    if (!album || !OST_MARK.test(album)) continue;
    const work = workTitleFromAlbum(album);
    if (!work || out.has(work)) continue;
    out.set(work, {
      work,
      uri: String(row.collectionViewUrl || row.trackViewUrl || ""),
      label: album,
      source: "itunes",
      // 앨범에 실렸다는 사실이지 역할(주제가·삽입곡)은 아니다
      claim: `${album}에 수록`,
    });
  }
  return [...out.values()];
}

// 타이업을 문장으로 적어 두는 곳 — 일본어 위키가 특히 꼼꼼하다.
const TIE_PATTERNS = [
  /[『「]([^』」]{1,60})[』」][^。]{0,40}?(主題歌|挿入歌|オープニングテーマ|エンディングテーマ|テーマソング|オープニング|エンディング)/g,
  /(주제가|삽입곡|오프닝|엔딩|OST)[^.]{0,30}?[〈《"“']([^〉》"”']{1,60})[〉》"”']/g,
  /(?:theme|soundtrack|opening|ending|insert song)[^.]{0,40}?(?:for|of|to)\s+(?:the\s+)?(?:film|movie|series|anime|drama|game)?\s*[“"']?([A-Z][^.,"”']{2,60})/g,
];

export async function wikipediaAppearanceCandidates(artist, title, lang = "en", { fetchImpl = fetch, timeoutMs = 12_000 } = {}) {
  const wiki = lang === "ja" ? "ja" : lang === "ko" ? "ko" : "en";
  const api = `https://${wiki}.wikipedia.org/w/api.php`;
  const get = async (params) => {
    const res = await fetchImpl(`${api}?${new URLSearchParams({ format: "json", ...params })}`, {
      headers: { "User-Agent": WIKI_UA },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`wiki ${res.status}`);
    return res.json();
  };

  let pages = [];
  try {
    const search = await get({ action: "query", list: "search", srsearch: `${title} ${artist}`, srlimit: "5" });
    pages = (search?.query?.search || []).map((row) => row.title);
  } catch {
    return [];
  }
  // 곡 문서를 먼저 본다. 아티스트 문서에는 그 아티스트의 모든 타이업이 적혀 있어
  // 어느 것이 이 곡의 것인지 가릴 수 없다 — 그건 추측이 된다.
  const songPages = pages.filter((page) => sameRecording(page.replace(/\s*\([^)]*\)\s*$/, ""), title));
  const out = [];
  for (const page of songPages.slice(0, 2)) {
    let extract = "";
    try {
      const detail = await get({ action: "query", prop: "extracts", explaintext: "1", titles: page });
      extract = Object.values(detail?.query?.pages || {})[0]?.extract || "";
    } catch {
      continue;
    }
    for (const pattern of TIE_PATTERNS) {
      for (const match of extract.matchAll(pattern)) {
        const work = String(match[1] || match[2] || "").trim();
        if (work.length < 2 || out.some((item) => item.work === work)) continue;
        out.push({
          work,
          uri: `https://${wiki}.wikipedia.org/wiki/${encodeURIComponent(page.replace(/ /g, "_"))}`,
          label: `위키백과 — ${page}`,
          source: "wikipedia",
          claim: match[0].trim().slice(0, 160),
        });
      }
    }
    if (out.length) break;
  }
  return out;
}

// ── 일반 웹 검색 (선택) ──────────────────────────────────────────────────
//
// iTunes와 위키백과로는 검증된 79건 중 22%밖에 못 찾는다. 나머지는 결국 일반
// 웹 검색이 있어야 한다 — 그것이 그라운딩이 하던 일이고, 막힌 것도 그것뿐이다.
//
// Brave Search API를 쓴다. 무료 등급이 월 2,000건인데 이 아카이브는 하루 1~4곡,
// 곡당 한 번 검색하므로 월 120건이면 충분하다. 키가 없으면 이 소스는 조용히
// 빠지고 나머지가 그대로 돈다 — 지금이 그 상태다.
//
//   BRAVE_API_KEY=...   https://api.search.brave.com 에서 무료 발급
//
// 무료 등급은 초당 1건이라 곡마다 한 번만 부른다.
const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
export const BRAVE_RESULT_LIMIT = 8;

export function appearanceQuery(artist, title) {
  return `"${artist}" "${title}" OST soundtrack 주제가 삽입곡 主題歌`;
}

export async function braveSearchResults(artist, title, { fetchImpl = fetch, timeoutMs = 12_000, apiKey = "" } = {}) {
  const key = String(apiKey || "").trim();
  if (!key || !artist || !title) return [];
  const url = `${BRAVE_ENDPOINT}?${new URLSearchParams({ q: appearanceQuery(artist, title), count: String(BRAVE_RESULT_LIMIT) })}`;
  try {
    const res = await fetchImpl(url, {
      headers: { Accept: "application/json", "X-Subscription-Token": key },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.web?.results || [])
      .filter((row) => row?.url)
      .slice(0, BRAVE_RESULT_LIMIT)
      .map((row) => ({
        uri: String(row.url),
        label: String(row.title || "웹 검색 결과"),
        // 제목만 읽고 판단하지 않도록 본문 발췌도 함께 넘긴다
        // 강조 태그는 지운다 — 공백으로 바꾸면 한중일 문장 사이에 빈칸이 생긴다
        snippet: String(row.description || "").replace(/<[^>]*>/g, "").replace(/\s{2,}/g, " ").trim().slice(0, 400),
        source: "brave",
      }));
  } catch {
    return [];
  }
}

// 두 소스를 합친다. iTunes를 앞에 둔다 — 앨범 수록은 사실이 명확하고, 위키 문장은
// 해석이 한 겹 더 필요하다.
export async function findAppearanceCandidates({ artist, title, lang }, options = {}) {
  const [itunes, wiki] = await Promise.all([
    itunesAppearanceCandidates(artist, title, options),
    wikipediaAppearanceCandidates(artist, title, lang, options),
  ]);
  const seen = new Set();
  return [...itunes, ...wiki].filter((item) => {
    const key = normalizeTitle(item.work);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── 후보를 수록 정보로 확정한다 ──────────────────────────────────────────
//
// 고를 것과 역할(주제가·삽입곡·배경음악)을 정하는 일만 모델에게 맡긴다.
// **그라운딩이 아니라 일반 호출**이다 — 막힌 것은 검색이지 생성이 아니다.
// 근거 URL은 모델이 아니라 iTunes·위키백과 응답에서 온 것이라 지어낼 수 없다.
const WORK_TYPES = new Set(["movie", "drama", "anime_movie", "anime_series", "documentary", "game", "other"]);
const ROLES = new Set(["main_theme", "opening", "ending", "insert_song", "background", "trailer", "other"]);

// 근거를 고르는 규칙. 두 종류가 섞여 들어온다:
//   구조화 후보(iTunes·위키) — 작품명을 이미 알고 있다. 작품명으로 짝짓는다.
//   검색 결과(Brave)        — 작품명은 모델이 발췌에서 읽어야 한다. 대신 모델이
//                             고른 evidenceUrl이 우리가 준 것 중 하나여야 한다.
// 어느 쪽이든 URL은 우리가 가져온 것이다 — 모델이 주소를 지어낼 자리가 없다.
export function pickCandidate(parsed, candidates) {
  const wantUrl = String(parsed?.evidenceUrl || "").trim();
  if (wantUrl) {
    const byUrl = candidates.find((c) => c.uri === wantUrl);
    if (byUrl) return byUrl;
    // 준 적 없는 주소를 지어냈다 — 버린다
    if (!parsed?.work) return null;
  }
  const want = normalizeTitle(parsed?.work);
  if (!want) return null;
  return (
    candidates.find((c) => c.work && normalizeTitle(c.work) === want) ||
    candidates.find((c) => c.work && (normalizeTitle(c.work).includes(want) || want.includes(normalizeTitle(c.work)))) ||
    null
  );
}

export async function suggestFromFreeSources({ key, title, artist, lang, geminiText, braveKey = "" }, options = {}) {
  const [structured, searched] = await Promise.all([
    findAppearanceCandidates({ artist, title, lang }, options),
    braveSearchResults(artist, title, { ...options, apiKey: braveKey }),
  ]);
  // 구조화 후보를 앞에 둔다 — 앨범 수록·위키 문장은 사실이 뚜렷하고, 검색 발췌는
  // 해석이 한 겹 더 필요하다.
  const candidates = [...structured, ...searched.filter((r) => !structured.some((c) => c.uri === r.uri))];

  // "찾지 못함"을 "없음"으로 내보내지 않는다. 이 경로의 재현율은 낮아서(키 없이
  // 22%) 빈손이 곧 수록 정보가 없다는 뜻이 될 수 없다. needs_review를 쓰면 화면이
  // 경고 문구를 그대로 보여 주고 사람이 직접 확인하게 된다.
  if (!candidates.length)
    return {
      appearance: null,
      state: "needs_review",
      warning: braveKey
        ? "웹 검색에서 수록 정보를 찾지 못했습니다. 수록된 작품이 없다는 뜻은 아니므로 직접 확인해 주세요."
        : "Apple Music·위키백과에서 수록 정보를 찾지 못했습니다. 수록된 작품이 없다는 뜻은 아니므로 직접 확인해 주세요.",
      candidates: [],
    };

  const line = (c, i) =>
    c.work
      ? `${i + 1}. 작품 후보: ${c.work}\n   출처: ${c.label}\n   URL: ${c.uri}\n   근거: ${c.claim}`
      : `${i + 1}. (검색 결과 — 작품명을 발췌에서 직접 읽어라)\n   제목: ${c.label}\n   URL: ${c.uri}\n   발췌: ${c.snippet}`;

  const prompt = `아래는 노래 "${title}" — ${artist}가 어떤 작품에 쓰였는지에 대한 검색 결과다.
모두 실제 출처에서 왔고, URL은 이미 확보돼 있다.

${candidates.map(line).join("\n")}

이 곡이 실제로 쓰인 작품 하나를 고르고, JSON만 출력해라. 확신이 없으면 work를 빈 문자열로 둔다.
{"work":"작품명","workType":"movie|drama|anime_movie|anime_series|documentary|game|other","role":"main_theme|opening|ending|insert_song|background|trailer|other","year":숫자 또는 null,"note":"한국어 한 문장","evidenceClaim":"곡과 작품의 관계를 설명하는 한국어 한 문장","evidenceUrl":"위 목록에 있는 URL 그대로"}

- evidenceUrl은 반드시 위 목록에 있는 것이어야 한다. 다른 주소를 쓰면 버려진다.
- 위 자료로 확인되지 않는 작품을 지어내지 마라.
- 곡명과 아티스트가 함께 확인되지 않으면 work를 비워라 — 동명이곡이 흔하다.
- 사운드트랙 앨범 수록만 확인된 경우 role은 background로 둔다 — 주제가라고 단정하지 마라.`;

  let parsed = null;
  try {
    const text = await geminiText(key, prompt, true);
    parsed = JSON.parse(String(text || "").replace(/^```json\s*|\s*```$/g, "").trim());
  } catch {
    parsed = null;
  }
  const chosen = parsed && pickCandidate(parsed, candidates);
  if (!chosen)
    return {
      appearance: null,
      state: "needs_review",
      warning: "후보는 찾았지만 어느 작품인지 확정하지 못했습니다. 아래 출처를 직접 확인해 주세요.",
      candidates,
    };

  const workType = WORK_TYPES.has(parsed.workType) ? parsed.workType : "movie";
  const year = Number.isFinite(Number(parsed.year)) && Number(parsed.year) > 1800 ? Number(parsed.year) : null;
  return {
    state: "verified",
    warning: "",
    candidates,
    appearance: {
      workTitle: String(parsed.work || chosen.work).slice(0, 200),
      originalTitle: "",
      workType,
      mediaType: workType === "drama" || workType === "anime_series" ? "tv" : "movie",
      role: ROLES.has(parsed.role) ? parsed.role : "background",
      year,
      season: null,
      episode: null,
      note: String(parsed.note || "").slice(0, 500),
      evidenceUrl: chosen.uri,
      evidenceLabel: chosen.label,
      evidenceClaim: String(parsed.evidenceClaim || chosen.claim || chosen.snippet || "").slice(0, 300),
      status: "verified",
    },
  };
}
