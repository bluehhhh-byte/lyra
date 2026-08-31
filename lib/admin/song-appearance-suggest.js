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

export async function suggestSongAppearance({ key, title, artist, album, year }) {
  if (!key || !String(title || "").trim() || !String(artist || "").trim()) return null;

  const result = await geminiGrounded(
    key,
    `웹 검색을 사용해 정확한 녹음 "${title}" — ${artist}가 영화·TV 드라마·TV 애니메이션·극장판 애니메이션에 실제로 사용됐는지 확인해라.
${album ? `앨범: ${album}` : ""}${year ? `\n발매 연도: ${year}` : ""}

판정 규칙:
- 작품의 공식 페이지, 제작사·배급사·방송사·음반사 자료, 공식 OST 트랙 목록처럼 곡과 작품의 관계를 명시한 웹 근거가 있을 때만 found=true.
- 곡명이나 앨범명에 작품명이 있다는 이유만으로 추정하지 마라.
- 팬 게시물, 검색 결과 제목만으로 확정하지 마라.
- 같은 제목의 다른 곡·커버·리메이크와 혼동하지 마라. 아티스트까지 일치해야 한다.
- 사용 사실이나 정확한 작품을 확인하지 못하면 반드시 found=false이고 나머지는 빈 값으로 둔다.
- role은 main_theme|opening|ending|insert_song|background|trailer|character_song|other 중 하나.
- workType은 movie|drama|anime_movie|anime_series 중 하나.
- 작품명은 가능하면 한국어 정식 제목으로 쓴다.

설명 없이 JSON 한 개만 출력:
{"found":true|false,"workTitle":"","originalTitle":"","workType":"movie","role":"insert_song","year":2022,"season":null,"episode":null,"note":""}`
  );
  if (!result?.text || !result.sources?.length) return null;

  let parsed;
  try {
    parsed = JSON.parse(jsonObject(result.text));
  } catch {
    return null;
  }
  if (parsed?.found !== true || !String(parsed.workTitle || "").trim()) return null;

  const source = result.sources[0];
  return {
    workTitle: String(parsed.workTitle).trim().slice(0, 200),
    originalTitle: String(parsed.originalTitle || "").trim().slice(0, 200),
    workType: WORK_TYPES.has(parsed.workType) ? parsed.workType : "movie",
    mediaType: parsed.workType === "drama" || parsed.workType === "anime_series" ? "tv" : "movie",
    role: ROLES.has(parsed.role) ? parsed.role : "other",
    year: optionalInteger(parsed.year),
    season: optionalInteger(parsed.season),
    episode: optionalInteger(parsed.episode),
    note: String(parsed.note || "").trim().slice(0, 500),
    evidenceUrl: source.uri,
    evidenceLabel: source.title,
    status: "verified",
    searchQueries: result.queries || [],
    searchEntryPoint: result.searchEntryPoint || "",
  };
}
